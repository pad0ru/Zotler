// ZotPlanner — companion website JS
// Handles transcript parsing (PDF.js), manual entry, and CSV/JSON export.

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let courses = [];   // [{course_id, course_name, units, grade, quarter, year, status, satisfies_req_id, gpa_points}]
let currentStep = 1;

// ── Step navigation ────────────────────────────────────────────

function goToStep(n) {
  document.getElementById(`step-${currentStep}`).classList.add("hidden");
  document.getElementById(`step-tab-${currentStep}`).classList.remove("active");
  currentStep = n;
  document.getElementById(`step-${n}`).classList.remove("hidden");
  document.getElementById(`step-tab-${n}`).classList.add("active");
  if (n === 2) renderTable();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── File input / drag-drop ─────────────────────────────────────

const uploadArea = document.getElementById("upload-area");
const fileInput  = document.getElementById("file-input");

uploadArea.addEventListener("dragover", e => {
  e.preventDefault();
  uploadArea.classList.add("drag-over");
});
uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("drag-over"));
uploadArea.addEventListener("drop", e => {
  e.preventDefault();
  uploadArea.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener("change", e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

function handleFile(file) {
  if (file.name.endsWith(".csv")) {
    parseCSV(file);
  } else if (file.name.endsWith(".pdf")) {
    parsePDF(file);
  } else {
    showToast("Unsupported file type. Upload a PDF transcript or CSV.");
  }
}

// ── PDF parsing via PDF.js ─────────────────────────────────────

// PDF.js returns positioned text items, NOT lines. We reconstruct lines by
// grouping items that share the same Y coordinate, then sorting left-to-right.
function extractLinesFromPDF(items) {
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

// UCI transcript course line format (confirmed from real transcript):
//   COURSE TITLE   DEPT CODE   COURSE NUM   UNITS   GRADE   GRADE_POINTS
// Example: "CALCULUS I MATH 2A 4.0 B 12.0"
// Special dept: "I & C SCI" (ICS courses) = 4 tokens
//
// Strategy: work backwards from the end of the token array.
function parseCourseTokens(line) {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 5) return null;

  const gradeRe = /^([A-DF][+-]?|P|NP|WD?|IP|S|U)$/;

  // Last 4 tokens (fixed): grade_points  grade  units  course_num
  const gradePointsStr = tokens[tokens.length - 1];
  const grade          = tokens[tokens.length - 2];
  const unitsStr       = tokens[tokens.length - 3];
  const courseNum      = tokens[tokens.length - 4];  // e.g. "2A", "31", "161"

  const gradePoints = parseFloat(gradePointsStr);
  const units       = parseFloat(unitsStr);

  if (isNaN(gradePoints) || isNaN(units)) return null;
  if (!gradeRe.test(grade)) return null;
  if (!/^\d+[A-Z]*$/.test(courseNum)) return null;

  // Remaining tokens = title words + dept code
  const rest = tokens.slice(0, tokens.length - 4);
  if (rest.length < 2) return null;

  // "I & C SCI" is 4 tokens — check for it before falling back to single-token dept
  let dept, titleTokens;
  if (rest.length >= 4 && rest.slice(-4).join(" ") === "I & C SCI") {
    dept        = "I & C SCI";
    titleTokens = rest.slice(0, -4);
  } else {
    // All other depts are a single ALLCAPS word (MATH, BME, HUMAN, STATS, etc.)
    dept        = rest[rest.length - 1];
    titleTokens = rest.slice(0, -1);
  }

  if (!titleTokens.length) return null;

  return {
    course_id:   `${dept} ${courseNum}`,
    course_name: titleTokens.join(" "),
    units,
    grade,
    gpa_points:  gradePoints,
  };
}

async function parsePDF(file) {
  showToast("Parsing transcript PDF...");
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // "2023 Fall Quarter" / "2024 Winter Quarter"
    const quarterRe = /^(\d{4})\s+(Fall|Winter|Spring|Summer)\s+Quarter$/i;

    // Lines to skip — totals, header boilerplate, etc.
    const skipRe = /^(Term Totals|Cumulative Totals|University Requirements|Memoranda|AP |GOLDEN WEST|Units Transferred|\*+|Your transcript|Official transcripts|Print This Page)/i;

    let currentQuarter = null, currentYear = null;
    const found = [];
    const debugLines = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();
      const lines   = extractLinesFromPDF(content.items);

      for (const line of lines) {
        const t = line.trim();
        if (!t || skipRe.test(t)) continue;
        debugLines.push(t);

        // Quarter header
        const qm = t.match(quarterRe);
        if (qm) { currentYear = qm[1]; currentQuarter = qm[2]; continue; }

        // Course entry
        const parsed = parseCourseTokens(t);
        if (parsed && currentQuarter) {
          found.push({
            ...parsed,
            quarter:          currentQuarter,
            year:             currentYear,
            status:           "completed",
            satisfies_req_id: "",
          });
        }
      }
    }

    if (found.length === 0) {
      console.warn("ZotPlanner: No courses matched. Reconstructed lines:");
      debugLines.forEach((l, i) => console.warn(`  [${i}] ${l}`));
      showToast("No courses detected. Open DevTools (F12 -> Console) to see extracted text.");
    } else {
      courses = found;
      showToast(`Parsed ${found.length} courses from transcript.`);
      goToStep(2);
    }

  } catch (err) {
    console.error("ZotPlanner PDF error:", err);
    showToast(`PDF error: ${err.message || err}. Try adding courses manually.`);
  }
}

// ── CSV import ─────────────────────────────────────────────────

function parseCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const lines  = e.target.result.trim().split("\n");
    const header = lines[0].split(",").map(h => h.trim());
    courses = lines.slice(1).map(line => {
      const vals = line.split(",");
      const obj  = {};
      header.forEach((h, i) => { obj[h] = (vals[i] || "").trim(); });
      return obj;
    }).filter(c => c.course_id);
    showToast(`Loaded ${courses.length} courses from CSV.`);
    goToStep(2);
  };
  reader.readAsText(file);
}

// ── Manual entry ───────────────────────────────────────────────

function addManualCourse() {
  const id     = document.getElementById("m-course-id").value.trim().toUpperCase();
  const name   = document.getElementById("m-course-name").value.trim();
  const units  = parseInt(document.getElementById("m-units").value) || 4;
  const grade  = document.getElementById("m-grade").value;
  const qtr    = document.getElementById("m-quarter").value;
  const year   = document.getElementById("m-year").value || new Date().getFullYear();
  const status = document.getElementById("m-status").value;

  if (!id) { showToast("Enter a course ID (e.g. ICS 31)"); return; }

  courses.push({
    course_id: id, course_name: name, units, grade,
    quarter: qtr, year, status, satisfies_req_id: "", gpa_points: "",
  });

  // Clear fields
  ["m-course-id","m-course-name","m-units"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("m-grade").value = "";

  showToast(`Added ${id}`);

  // If already on step 2, re-render
  if (currentStep === 2) renderTable();
  else goToStep(2);
}

// ── Table render ───────────────────────────────────────────────

function renderTable() {
  const tbody = document.getElementById("courses-body");
  tbody.innerHTML = "";

  courses.forEach((c, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${esc(c.course_id)}</strong></td>
      <td>${esc(c.course_name)}</td>
      <td>${c.units}</td>
      <td><span class="grade-pill ${gradeClass(c.grade)}">${esc(c.grade) || "—"}</span></td>
      <td>${esc(c.quarter) || "—"}</td>
      <td>${esc(c.year) || "—"}</td>
      <td><span class="status-pill status-${c.status}">${c.status.replace("_"," ")}</span></td>
      <td><button class="btn-remove" onclick="removeCourse(${i})" title="Remove">×</button></td>
    `;
    tbody.appendChild(tr);
  });

  updateStats();
}

function removeCourse(i) {
  courses.splice(i, 1);
  renderTable();
}

function gradeClass(g) {
  if (!g) return "grade-other";
  if (g.startsWith("A")) return "grade-a";
  if (g.startsWith("B")) return "grade-b";
  if (g.startsWith("C")) return "grade-c";
  if (g.startsWith("D") || g === "F") return "grade-d";
  return "grade-other";
}

function updateStats() {
  const completed   = courses.filter(c => c.status === "completed").length;
  const units_done  = courses.filter(c => c.status === "completed")
                             .reduce((s, c) => s + (+c.units || 0), 0);
  const bar = document.getElementById("stats-bar");
  bar.innerHTML = `
    <span class="stat-chip green">${completed} completed</span>
    <span class="stat-chip blue">${units_done} units</span>
    <span class="stat-chip">${courses.length} total</span>
  `;
}

// ── Export ─────────────────────────────────────────────────────

function exportCSV() {
  const header = "course_id,course_name,units,grade,quarter,year,status,satisfies_req_id,gpa_points";
  const rows   = courses.map(c =>
    [c.course_id, c.course_name, c.units, c.grade, c.quarter, c.year,
     c.status, c.satisfies_req_id || "", c.gpa_points || ""].join(",")
  );
  download("user_courses.csv", [header, ...rows].join("\n"), "text/csv");
  showToast("Downloaded user_courses.csv");
}

function exportJSON() {
  const payload = {
    exported_at: new Date().toISOString(),
    courses,
    meta: {
      total_courses: courses.length,
      completed_units: courses.filter(c => c.status === "completed")
                              .reduce((s,c) => s + (+c.units||0), 0),
    },
  };
  download("zotplanner_profile.json", JSON.stringify(payload, null, 2), "application/json");
  showToast("Downloaded zotplanner_profile.json");
}

function download(filename, content, type) {
  const a   = document.createElement("a");
  const url = URL.createObjectURL(new Blob([content], { type }));
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Toast ──────────────────────────────────────────────────────

let toastTimer;
function showToast(msg) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function esc(s) {
  return (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
