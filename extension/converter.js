// Zotler Transcript Converter — runs as a full extension tab page

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.js");

let courses = [];

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

async function parsePDF(file) {
  showProgress(true, "Reading PDF…", 0);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const quarterRe = /^(\d{4})\s+(Fall|Winter|Spring|Summer)\s+Quarter$/i;
    const skipRe    = /^(Term Totals|Cumulative Totals|University Requirements|Memoranda|AP |GOLDEN WEST|Units Transferred|\*+|Your transcript|Official transcripts|Print This Page)/i;

    let currentQuarter = null, currentYear = null;
    const found = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      showProgress(true, `Parsing page ${p} of ${pdf.numPages}…`, Math.round((p / pdf.numPages) * 95));
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();
      const lines   = extractLines(content.items);

      for (const line of lines) {
        const t = line.trim();
        if (!t || skipRe.test(t)) continue;

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

// ── Review table ───────────────────────────────────────────────

function showReview() {
  document.getElementById("step-upload").classList.add("hidden");
  document.getElementById("step-review").classList.remove("hidden");
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

// ── Action buttons ─────────────────────────────────────────────

document.getElementById("back-btn").addEventListener("click", () => {
  courses = [];
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

document.getElementById("save-btn").addEventListener("click", async () => {
  // Merge with any existing profile in storage
  const stored = await storageGet("profile");
  const profile = stored || { major: "Computer Science B.S.", minor: null, grad_expected: "Spring 2026", courses: [] };
  profile.courses = courses;
  await storageSet("profile", profile);

  document.getElementById("step-review").classList.add("hidden");
  document.getElementById("step-done").classList.remove("hidden");
  document.getElementById("done-msg").textContent =
    `${courses.length} courses (${courses.reduce((s,c) => s + (+c.units||0), 0)} units) saved to your Zotler profile.`;
});

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
