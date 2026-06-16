// Zotler Transcript Converter — runs as a full extension tab page

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.js");

// ── State ──────────────────────────────────────────────────────

let courses        = [];   // UCI courses parsed from transcript
let detectedCCs    = [];   // Institution names found in CC blocks on transcript
let transferCourses = [];  // User-confirmed transfer credits (after ASSIST lookup)
let assistInited   = false;

// ── Drag & drop + file input ───────────────────────────────────

const uploadArea = document.getElementById("upload-area");
const pdfInput   = document.getElementById("pdf-input");

uploadArea.addEventListener("dragover", e => {
  e.preventDefault();
  uploadArea.classList.add("drag-over");
});
uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("drag-over"));
uploadArea.addEventListener("drop", e => {
  e.preventDefault();
  uploadArea.classList.remove("drag-over");
  const f = e.dataTransfer.files[0];
  if (f && f.name.endsWith(".pdf")) parsePDF(f);
  else showError("Please drop a PDF file.");
});
pdfInput.addEventListener("change", e => {
  if (e.target.files[0]) parsePDF(e.target.files[0]);
});

// ── PDF line reconstructor ─────────────────────────────────────

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

// UCI transcript line: TITLE DEPT COURSENUM UNITS GRADE GRADEPOINTS
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
    course_id:        `${dept} ${courseNum}`,
    course_name:      titleTokens.join(" "),
    units,
    grade,
    gpa_points:       gradePoints,
    status:           "completed",
    quarter:          "",
    year:             "",
    satisfies_req_id: "",
  };
}

// CC institution block: "GOLDEN WEST COL (Units 4.5) 1 Terms to 08/22"
const CC_BLOCK_RE = /^(.+?)\s+\(Units\s+[\d.]+\)\s+\d+\s+Terms?\s+to\s+\d+\/\d+$/i;

async function parsePDF(file) {
  showProgress(true, "Reading PDF…", 0);
  detectedCCs = [];

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const quarterRe = /^(\d{4})\s+(Fall|Winter|Spring|Summer)\s+Quarter$/i;
    // Lines to skip entirely (CC institution blocks are handled separately above)
    const skipRe = /^(Term Totals|Cumulative Totals|University Requirements|Memoranda|AP |Units Transferred|\*+|Your transcript|Official transcripts|Print This Page)/i;

    let currentQuarter = null, currentYear = null;
    const found = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      showProgress(true, `Parsing page ${p} of ${pdf.numPages}…`, Math.round((p / pdf.numPages) * 95));
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();
      const lines   = extractLines(content.items);

      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;

        // Detect CC institution blocks before the generic skip
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
          found.push({ ...parsed, quarter: currentQuarter, year: currentYear });
        }
      }
    }

    showProgress(false);

    if (found.length === 0) {
      showError("No courses detected. Make sure you uploaded the UCI unofficial transcript PDF.");
    } else {
      courses = found;
      showReview();
    }

  } catch (err) {
    showProgress(false);
    showError(`PDF error: ${err.message}`);
  }

  pdfInput.value = "";
}

// ── Progress / error helpers ───────────────────────────────────

function showProgress(visible, label = "", pct = 0) {
  const wrap = document.getElementById("progress-wrap");
  wrap.classList.toggle("hidden", !visible);
  document.getElementById("progress-label").textContent = label;
  document.getElementById("progress-bar").style.width = pct + "%";
}

function showError(msg) {
  const p = document.createElement("p");
  p.style.cssText = "color:#e74c3c;font-size:13px;margin-top:14px;text-align:center";
  p.textContent = msg;
  const existing = uploadArea.parentNode.querySelector(".err-msg");
  if (existing) existing.remove();
  p.className = "err-msg";
  uploadArea.parentNode.appendChild(p);
}

// ── Review step ────────────────────────────────────────────────

function showReview() {
  document.getElementById("step-upload").classList.add("hidden");
  document.getElementById("step-transfer").classList.add("hidden");
  document.getElementById("step-review").classList.remove("hidden");

  // Show CC banner if we detected community college blocks
  const banner = document.getElementById("cc-banner");
  if (detectedCCs.length > 0) {
    banner.classList.remove("hidden");
    document.getElementById("cc-banner-text").textContent =
      `Transfer credit from ${detectedCCs.join(", ")} detected on your transcript.`;
  } else {
    banner.classList.add("hidden");
  }

  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("course-tbody");
  tbody.innerHTML = "";
  courses.forEach((c, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${esc(c.course_id)}</strong></td>
      <td>${esc(c.course_name)}</td>
      <td>${c.units}</td>
      <td><span class="grade-pill ${gradeClass(c.grade)}">${esc(c.grade)}</span></td>
      <td>${esc(c.quarter)}</td>
      <td>${esc(c.year)}</td>
      <td><button class="btn-remove" data-i="${i}" title="Remove">×</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      courses.splice(parseInt(btn.dataset.i), 1);
      renderTable();
    });
  });

  updateStats();
}

function updateStats() {
  const units = courses.reduce((s, c) => s + (+c.units || 0), 0);
  document.getElementById("stats").innerHTML = `
    <span class="chip green">${courses.length} courses</span>
    <span class="chip blue">${units} units</span>
  `;
}

function gradeClass(g = "") {
  if (g.startsWith("A")) return "g-a";
  if (g.startsWith("B")) return "g-b";
  if (g.startsWith("C")) return "g-c";
  if (g.startsWith("D") || g === "F") return "g-d";
  return "g-x";
}

function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Review action buttons ──────────────────────────────────────

document.getElementById("back-btn").addEventListener("click", () => {
  courses = [];
  detectedCCs = [];
  transferCourses = [];
  document.getElementById("step-review").classList.add("hidden");
  document.getElementById("step-upload").classList.remove("hidden");
  const err = document.querySelector(".err-msg");
  if (err) err.remove();
});

document.getElementById("export-btn").addEventListener("click", () => {
  const header = "course_id,course_name,units,grade,quarter,year,status,satisfies_req_id,gpa_points";
  const rows   = courses.map(c =>
    [c.course_id, c.course_name, c.units, c.grade, c.quarter, c.year,
     c.status, c.satisfies_req_id || "", c.gpa_points || ""].join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob), download: "user_courses.csv"
  });
  a.click();
  URL.revokeObjectURL(a.href);
});

// "Save to Zotler" — saves only UCI courses, skips transfer step
document.getElementById("save-btn").addEventListener("click", () => {
  saveProfile(courses, []);
});

// Both the action-row button and the CC banner button open the transfer step
document.getElementById("add-transfer-btn").addEventListener("click", openTransferStep);
document.getElementById("cc-banner-btn").addEventListener("click", openTransferStep);

// ── Transfer step ──────────────────────────────────────────────

async function openTransferStep() {
  document.getElementById("step-review").classList.add("hidden");
  document.getElementById("step-transfer").classList.remove("hidden");

  if (!assistInited) {
    await initAssist();
    assistInited = true;
  }

  // Pre-select the school if transcript revealed a CC name
  if (detectedCCs.length > 0) {
    tryPreselectSchool(detectedCCs[0]);
    setAgreementStatus(
      `Detected "${detectedCCs.join(", ")}" on your transcript — select it above and load the agreement.`
    );
  }

  // Redraw transfer list in case user went back and forth
  renderTransferList();
}

async function initAssist() {
  const schoolSel = document.getElementById("cc-school");
  const yearSel   = document.getElementById("cc-year");

  schoolSel.innerHTML = '<option value="">Loading colleges…</option>';
  yearSel.innerHTML   = '<option value="">Loading years…</option>';

  try {
    const [, years] = await Promise.all([
      ASSIST.getInstitutions(),  // populates internal cache; getCCCs() reads from it
      ASSIST.getYears(),
    ]);

    const cccs = ASSIST.getCCCs();
    schoolSel.innerHTML =
      '<option value="">— Select your college —</option>' +
      cccs.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");

    yearSel.innerHTML = years
      .map(y => `<option value="${y.id}">${esc(y.label ?? y.name ?? String(y.id))}</option>`)
      .join("");

  } catch (err) {
    schoolSel.innerHTML = '<option value="">Failed to load — check connection</option>';
    setAgreementStatus(`Could not reach ASSIST API: ${err.message}`, true);
    console.error("ASSIST init error:", err);
  }
}

// Fuzzy-match the raw CC name from the transcript to the ASSIST dropdown
function tryPreselectSchool(rawName) {
  const sel  = document.getElementById("cc-school");
  const norm = rawName.toLowerCase()
    .replace(/\bcol\b/, "college")
    .replace(/\s+/g, " ")
    .trim();

  for (const opt of sel.options) {
    const optNorm = opt.text.toLowerCase().replace(/\s+/g, " ");
    // Check if either string contains a significant part of the other
    const words = norm.split(" ").filter(w => w.length > 3);
    if (words.length > 0 && words.every(w => optNorm.includes(w))) {
      opt.selected = true;
      return;
    }
  }
}

document.getElementById("load-agreement-btn").addEventListener("click", loadAgreement);

async function loadAgreement() {
  const cccId  = document.getElementById("cc-school").value;
  const yearId = document.getElementById("cc-year").value;

  if (!cccId)  { setAgreementStatus("Please select a college.", true); return; }
  if (!yearId) { setAgreementStatus("Please select a year.", true); return; }

  setAgreementStatus("Fetching articulation agreement from ASSIST…");
  document.getElementById("agreement-wrap").classList.add("hidden");

  try {
    const agreementsList = await ASSIST.getAgreements(cccId, yearId);

    // Extract keys — API may return array of objects or a single object
    const list = Array.isArray(agreementsList) ? agreementsList : [agreementsList];
    const keys = list.map(a => a.key ?? a.Key ?? a.agreementKey).filter(Boolean);

    if (!keys.length) {
      setAgreementStatus(
        "No articulation agreement found for this school and year. Try a different year.", true
      );
      console.log("ASSIST agreements response:", agreementsList);
      return;
    }

    // Fetch and merge mappings from up to 3 agreement keys (avoids too many requests)
    const allMappings = [];
    for (const key of keys.slice(0, 3)) {
      try {
        const raw = await ASSIST.getAgreement(key);
        allMappings.push(...ASSIST.parseMappings(raw));
      } catch (e) {
        console.warn("Skipping agreement key", key, e.message);
      }
    }

    if (!allMappings.length) {
      setAgreementStatus(
        "Agreement fetched but no course mappings parsed. Check the console for the raw response.", true
      );
      console.log("ASSIST raw agreement (no mappings parsed):", await ASSIST.getAgreement(keys[0]).catch(() => null));
      return;
    }

    const schoolName = document.getElementById("cc-school").selectedOptions[0]?.text ?? "CC";
    renderAgreementTable(allMappings, schoolName);
    setAgreementStatus(`${allMappings.length} articulated courses found.`, false, true);

  } catch (err) {
    setAgreementStatus(`Error: ${err.message}`, true);
    console.error("ASSIST loadAgreement error:", err);
  }
}

function renderAgreementTable(mappings, schoolName) {
  const tbody = document.getElementById("agreement-tbody");
  tbody.innerHTML = "";

  mappings.forEach((m, i) => {
    const alreadyAdded = transferCourses.some(tc => tc.cc_course_id === m.ccCourse.id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" data-i="${i}" ${alreadyAdded ? 'checked disabled title="Already added"' : ""}></td>
      <td>
        <strong>${esc(m.ccCourse.id)}</strong><br>
        <span style="font-size:12px;color:var(--sub)">${esc(m.ccCourse.title)}</span>
      </td>
      <td>${m.ccCourse.units || "—"}</td>
      <td>
        <strong>${esc(m.uciCourse.id)}</strong><br>
        <span style="font-size:12px;color:var(--sub)">${esc(m.uciCourse.title)}</span>
      </td>
      <td>${m.uciCourse.units || "—"}</td>
    `;
    tbody.appendChild(tr);
  });

  // Stash mappings + school name on the element for retrieval in addSelectedCourses
  tbody._mappings   = mappings;
  tbody._schoolName = schoolName;

  document.getElementById("agreement-wrap").classList.remove("hidden");
}

document.getElementById("add-selected-btn").addEventListener("click", addSelectedCourses);

function addSelectedCourses() {
  const tbody = document.getElementById("agreement-tbody");
  if (!tbody._mappings) return;

  let added = 0;
  tbody.querySelectorAll("input[type='checkbox']:not(:disabled)").forEach(cb => {
    if (!cb.checked) return;
    const m = tbody._mappings[parseInt(cb.dataset.i)];
    if (!m) return;
    if (transferCourses.some(tc => tc.cc_course_id === m.ccCourse.id)) return;

    transferCourses.push({
      // Standard fields — course_id is the UCI equivalent so prereq/degree checks work
      course_id:        m.uciCourse.id,
      course_name:      m.uciCourse.title,
      units:            m.uciCourse.units,   // UCI units: counts toward degree progress
      grade:            "TR",                // Transfer notation; excluded from UCI GPA
      quarter:          "Transfer",
      year:             "",
      status:           "completed",
      satisfies_req_id: "",
      gpa_points:       0,                   // Transfer credits do NOT count in UCI GPA

      // Transfer metadata (informational)
      source:           "transfer",
      cc_institution:   tbody._schoolName,
      cc_course_id:     m.ccCourse.id,
      cc_course_name:   m.ccCourse.title,
      cc_units:         m.ccCourse.units,    // Original CC units (may differ from UCI units)
    });
    added++;
  });

  renderTransferList();
  if (added > 0) {
    setAgreementStatus(`${added} course${added !== 1 ? "s" : ""} added.`, false, true);
  } else {
    setAgreementStatus("No new courses selected.", false);
  }
}

function renderTransferList() {
  const wrap = document.getElementById("transfer-list-wrap");
  if (transferCourses.length === 0) {
    wrap.classList.add("hidden");
    return;
  }

  wrap.classList.remove("hidden");
  const tbody = document.getElementById("transfer-tbody");
  tbody.innerHTML = "";

  transferCourses.forEach((tc, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <strong>${esc(tc.course_id)}</strong>
        <span class="badge-tr">TR</span><br>
        <span style="font-size:12px;color:var(--sub)">${esc(tc.course_name)}</span>
      </td>
      <td>${tc.units}</td>
      <td><span style="font-size:12px">${esc(tc.cc_institution)}</span></td>
      <td>
        ${esc(tc.cc_course_id)}
        <span style="font-size:11px;color:var(--sub)">(${tc.cc_units} CC units)</span>
      </td>
      <td><button class="btn-remove" data-i="${i}" title="Remove">×</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      transferCourses.splice(parseInt(btn.dataset.i), 1);
      renderTransferList();
    });
  });

  const totalUnits = transferCourses.reduce((s, tc) => s + (+tc.units || 0), 0);
  document.getElementById("transfer-stats").innerHTML =
    `<span class="chip green">${transferCourses.length} courses</span> ` +
    `<span class="chip blue">${totalUnits} UCI units</span>`;
}

function setAgreementStatus(msg, isError = false, isOk = false) {
  const el = document.getElementById("agreement-status");
  el.textContent = msg;
  el.className = "status-msg" + (isError ? " error" : isOk ? " ok" : "");
}

document.getElementById("back-to-review-btn").addEventListener("click", showReview);

document.getElementById("skip-transfer-btn").addEventListener("click", () => {
  saveProfile(courses, []);
});

document.getElementById("save-with-transfer-btn").addEventListener("click", () => {
  saveProfile(courses, transferCourses);
});

// ── Profile save ───────────────────────────────────────────────

async function saveProfile(uciCourses, xferCourses) {
  const allCourses = [...uciCourses, ...xferCourses];

  const stored  = await storageGet("profile");
  const profile = stored || {
    major: "Computer Science B.S.", minor: null, grad_expected: "Spring 2026", courses: []
  };
  profile.courses = allCourses;
  await storageSet("profile", profile);

  // Hide both active steps
  document.getElementById("step-review").classList.add("hidden");
  document.getElementById("step-transfer").classList.add("hidden");
  document.getElementById("step-done").classList.remove("hidden");

  const uciUnits  = uciCourses.reduce((s, c) => s + (+c.units || 0), 0);
  const xferUnits = xferCourses.reduce((s, c) => s + (+c.units || 0), 0);
  let msg = `${uciCourses.length} UCI courses (${uciUnits} units)`;
  if (xferCourses.length) {
    msg += ` + ${xferCourses.length} transfer credit${xferCourses.length !== 1 ? "s" : ""} (${xferUnits} UCI units)`;
  }
  document.getElementById("done-msg").textContent = msg + " saved to your Zotler profile.";
}

document.getElementById("close-btn").addEventListener("click", () => window.close());

// ── Storage helpers ────────────────────────────────────────────

function storageGet(key) {
  return new Promise(resolve =>
    chrome.storage.local.get(key, r => resolve(r[key] ?? null))
  );
}

function storageSet(key, value) {
  return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
}
