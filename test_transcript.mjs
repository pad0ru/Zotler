// Standalone test: mirrors converter.js parsing logic exactly
// Run with: node test_transcript.mjs

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_PATH  = join(__dirname, "User files /Unofficial Transcript.pdf");

// ── Load PDF.js (legacy/node build) ──────────────────────────────
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
// Point workerSrc at the bundled worker so pdfjs doesn't complain
const workerPath = new URL(
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url
);
pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath.href;

// ── Helpers (copied verbatim from converter.js) ───────────────────

function extractLines(items) {
  const byY = new Map();
  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = Math.round(item.transform[5]);
    const x = item.transform[4];
    if (!byY.has(y)) byY.set(y, []);
    byY.get(y).push({ x, str: item.str });
  }
  return [...byY.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, its]) => its.sort((a, b) => a.x - b.x).map(i => i.str).join(" "));
}

function parseCourseTokens(line) {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 5) return null;

  const gradeRe        = /^([A-DF][+-]?|P|NP|WD?|IP|S|U)$/;
  const gradePointsStr = tokens[tokens.length - 1];
  const grade          = tokens[tokens.length - 2];
  const unitsStr       = tokens[tokens.length - 3];
  const courseNum      = tokens[tokens.length - 4];

  const gradePoints = parseFloat(gradePointsStr);
  const units       = parseFloat(unitsStr);

  if (isNaN(gradePoints) || isNaN(units)) return null;
  if (!gradeRe.test(grade)) return null;
  if (!/^\d+[A-Z]*$/.test(courseNum)) return null;

  const rest = tokens.slice(0, tokens.length - 4);
  if (rest.length < 2) return null;

  let dept, titleTokens;
  if (rest.length >= 4 && rest.slice(-4).join(" ") === "I & C SCI") {
    dept = "I & C SCI"; titleTokens = rest.slice(0, -4);
  } else {
    dept = rest[rest.length - 1]; titleTokens = rest.slice(0, -1);
  }
  if (!titleTokens.length) return null;

  return {
    course_id:   `${dept} ${courseNum}`,
    course_name: titleTokens.join(" "),
    units,
    grade,
    gpa_points:  gradePoints,
    status:      "completed",
    quarter:     "",
    year:        "",
  };
}

const CC_BLOCK_RE = /^(.+?)\s+\(Units\s+[\d.]+\)\s+\d+\s+Terms?\s+to\s+\d+\/\d+$/i;

// ── Run the parse ────────────────────────────────────────────────

const data = new Uint8Array(readFileSync(PDF_PATH));
const pdf  = await pdfjsLib.getDocument({ data }).promise;

const quarterRe = /^(\d{4})\s+(Fall|Winter|Spring|Summer)\s+Quarter$/i;
const skipRe    = /^(Term Totals|Cumulative Totals|University Requirements|Memoranda|AP |Units Transferred|\*+|Your transcript|Official transcripts|Print This Page)/i;

let currentQuarter = null, currentYear = null;
const courses     = [];
const detectedCCs = [];

for (let p = 1; p <= pdf.numPages; p++) {
  const page    = await pdf.getPage(p);
  const content = await page.getTextContent();
  const lines   = extractLines(content.items);

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    const ccm = t.match(CC_BLOCK_RE);
    if (ccm) {
      const name = ccm[1].trim();
      if (!detectedCCs.includes(name)) detectedCCs.push(name);
      continue;
    }

    if (skipRe.test(t)) continue;

    const qm = t.match(quarterRe);
    if (qm) { currentYear = qm[1]; currentQuarter = qm[2]; continue; }

    const parsed = parseCourseTokens(t);
    if (parsed && currentQuarter) {
      courses.push({ ...parsed, quarter: currentQuarter, year: currentYear });
    }
  }
}

// ── Report ───────────────────────────────────────────────────────

console.log("\n========== TRANSCRIPT PARSE TEST ==========\n");

// Test 1: any courses at all?
const t1 = courses.length > 0;
console.log(`[${t1 ? "PASS" : "FAIL"}] Courses detected: ${courses.length}`);

// Test 2: all courses have a valid course_id
// dept may contain digits (e.g. IN4MATX) — allow word chars, spaces, &
const badId = courses.filter(c => !/^[\w &]+\s+\d+[A-Z]*$/.test(c.course_id));
const t2 = badId.length === 0;
console.log(`[${t2 ? "PASS" : "FAIL"}] All course_ids valid${badId.length ? " — bad: " + badId.map(c=>c.course_id).join(", ") : ""}`);

// Test 3: all courses have a non-empty course_name
const noName = courses.filter(c => !c.course_name.trim());
const t3 = noName.length === 0;
console.log(`[${t3 ? "PASS" : "FAIL"}] All courses have a name${noName.length ? " — missing on: " + noName.map(c=>c.course_id).join(", ") : ""}`);

// Test 4: all courses have valid units (>0)
const badUnits = courses.filter(c => isNaN(c.units) || c.units <= 0);
const t4 = badUnits.length === 0;
console.log(`[${t4 ? "PASS" : "FAIL"}] All courses have valid units${badUnits.length ? " — bad: " + badUnits.map(c=>c.course_id).join(", ") : ""}`);

// Test 5: all courses have quarter + year assigned
const noQuarter = courses.filter(c => !c.quarter || !c.year);
const t5 = noQuarter.length === 0;
console.log(`[${t5 ? "PASS" : "FAIL"}] All courses assigned a quarter/year${noQuarter.length ? " — missing on: " + noQuarter.map(c=>c.course_id).join(", ") : ""}`);

// Test 6: grade format
const gradeRe = /^([A-DF][+-]?|P|NP|WD?|IP|S|U)$/;
const badGrade = courses.filter(c => !gradeRe.test(c.grade));
const t6 = badGrade.length === 0;
console.log(`[${t6 ? "PASS" : "FAIL"}] All grades valid${badGrade.length ? " — bad: " + badGrade.map(c=>`${c.course_id}(${c.grade})`).join(", ") : ""}`);

// Test 7: CC detection (informational)
console.log(`[INFO] Community college blocks detected: ${detectedCCs.length > 0 ? detectedCCs.join(", ") : "none"}`);

// ── Summary table ────────────────────────────────────────────────

const totalUnits = courses.reduce((s, c) => s + c.units, 0);
const byQuarter  = {};
for (const c of courses) {
  const key = `${c.year} ${c.quarter}`;
  byQuarter[key] = (byQuarter[key] || 0) + 1;
}

console.log("\n--- Courses by quarter ---");
for (const [q, n] of Object.entries(byQuarter)) console.log(`  ${q}: ${n} courses`);

console.log(`\n--- Total: ${courses.length} courses, ${totalUnits} units ---`);

console.log("\n--- Sample (first 10 courses) ---");
courses.slice(0, 10).forEach(c =>
  console.log(`  ${c.course_id.padEnd(20)} ${c.course_name.padEnd(40)} ${String(c.units).padStart(4)} units  ${c.grade.padEnd(4)}  ${c.year} ${c.quarter}`)
);

const allPass = t1 && t2 && t3 && t4 && t5 && t6;
console.log(`\n========== ${allPass ? "ALL TESTS PASSED ✓" : "SOME TESTS FAILED ✗"} ==========\n`);
process.exit(allPass ? 0 : 1);
