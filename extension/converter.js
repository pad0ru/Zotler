// Zotler Transcript Converter — runs as a full extension tab page
// Imports the AI-generated DegreeWorks CSV (12 columns) and saves it to the profile.

// ── State ──────────────────────────────────────────────────────

let courses = [];   // Course rows parsed from the CSV

// Expected CSV columns, in order. We map by header name so column order is tolerant.
const EXPECTED_COLUMNS = [
  "course_id", "course_name", "units", "grade", "term", "status",
  "source", "transfer_origin", "gpa_points", "req_block", "satisfies_req", "exception_note",
];

// ── Drag & drop + file input ───────────────────────────────────

const uploadArea = document.getElementById("upload-area");
const csvInput   = document.getElementById("csv-input");

uploadArea.addEventListener("dragover", e => {
  e.preventDefault();
  uploadArea.classList.add("drag-over");
});
uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("drag-over"));
uploadArea.addEventListener("drop", e => {
  e.preventDefault();
  uploadArea.classList.remove("drag-over");
  const f = e.dataTransfer.files[0];
  if (f && f.name.toLowerCase().endsWith(".csv")) loadCSV(f);
  else showError("Please drop a .csv file.");
});
csvInput.addEventListener("change", e => {
  if (e.target.files[0]) loadCSV(e.target.files[0]);
});

// ── CSV parsing ────────────────────────────────────────────────

// Minimal RFC-4180 parser: handles quoted fields, escaped quotes (""), and
// commas / newlines inside quotes.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"')                       { inQuotes = true; }
    else if (c === ",")                  { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;        // CRLF
      row.push(field); field = "";
      if (row.some(v => v !== "")) rows.push(row);        // skip blank lines
      row = [];
    } else {
      field += c;
    }
  }
  // flush trailing field/row
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some(v => v !== "")) rows.push(row);
  }
  return rows;
}

async function loadCSV(file) {
  clearError();

  try {
    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length < 2) {
      showError("That CSV looks empty. Make sure it has a header row plus course rows.");
      return;
    }

    const header = rows[0].map(h => h.trim().toLowerCase());
    const idx = {};
    EXPECTED_COLUMNS.forEach(col => { idx[col] = header.indexOf(col); });

    if (idx.course_id === -1) {
      showError(
        "Couldn't find a \"course_id\" column. This importer expects the 12-column " +
        "DegreeWorks CSV from the tutorial prompt."
      );
      return;
    }

    const parsed = rows.slice(1).map(r => {
      const get = col => (idx[col] !== -1 ? (r[idx[col]] ?? "").trim() : "");
      return {
        course_id:       get("course_id"),
        course_name:     get("course_name"),
        units:           parseFloat(get("units")) || 0,
        grade:           get("grade"),
        term:            get("term"),
        status:          get("status") || "completed",
        source:          get("source") || "uci",
        transfer_origin: get("transfer_origin"),
        gpa_points:      parseFloat(get("gpa_points")) || 0,
        req_block:       get("req_block"),
        satisfies_req:   get("satisfies_req"),
        exception_note:  get("exception_note"),
      };
    }).filter(c => c.course_id);  // drop rows with no course id

    if (parsed.length === 0) {
      showError("No course rows found in that CSV.");
      return;
    }

    courses = parsed;
    showReview();

  } catch (err) {
    showError(`Couldn't read that file: ${err.message}`);
  }

  csvInput.value = "";
}

// ── Error helper ───────────────────────────────────────────────

function showError(msg) {
  clearError();
  const p = document.createElement("p");
  p.style.cssText = "color:#e74c3c;font-size:13px;margin-top:14px;text-align:center";
  p.textContent = msg;
  p.className = "err-msg";
  uploadArea.parentNode.appendChild(p);
}

function clearError() {
  const existing = document.querySelector(".err-msg");
  if (existing) existing.remove();
}

// ── Review step ────────────────────────────────────────────────

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
      <td>${esc(c.term)}</td>
      <td><span class="status-pill ${statusClass(c.status)}">${esc(statusLabel(c.status))}</span></td>
      <td>${esc(sourceLabel(c))}</td>
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
  const units      = courses.reduce((s, c) => s + (+c.units || 0), 0);
  const completed  = courses.filter(c => c.status === "completed").length;
  const inProgress = courses.filter(c => c.status === "in_progress").length;
  const planned    = courses.filter(c => c.status === "planned").length;
  document.getElementById("stats").innerHTML = `
    <span class="chip green">${courses.length} courses</span>
    <span class="chip blue">${units} units</span>
    <span class="chip">${completed} done · ${inProgress} in progress · ${planned} planned</span>
  `;
}

function gradeClass(g = "") {
  if (g.startsWith("A")) return "g-a";
  if (g.startsWith("B")) return "g-b";
  if (g.startsWith("C")) return "g-c";
  if (g.startsWith("D") || g === "F") return "g-d";
  return "g-x";
}

function statusClass(s = "") {
  if (s === "completed")   return "st-done";
  if (s === "in_progress") return "st-prog";
  if (s === "planned")     return "st-plan";
  return "st-x";
}

function statusLabel(s = "") {
  return ({ completed: "Completed", in_progress: "In progress", planned: "Planned" })[s] || s;
}

function sourceLabel(c) {
  if (c.source === "transfer") return `Transfer${c.transfer_origin ? ` (${c.transfer_origin})` : ""}`;
  if (c.source === "ap")       return "AP";
  return "UCI";
}

function esc(s) {
  return (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Review action buttons ──────────────────────────────────────

document.getElementById("back-btn").addEventListener("click", () => {
  courses = [];
  document.getElementById("step-review").classList.add("hidden");
  document.getElementById("step-upload").classList.remove("hidden");
  clearError();
});

document.getElementById("save-btn").addEventListener("click", () => saveProfile(courses));

document.getElementById("close-btn").addEventListener("click", () => window.close());

// ── Profile save ───────────────────────────────────────────────

async function saveProfile(allCourses) {
  const stored  = await storageGet("profile");
  const profile = stored || {
    major: "Computer Science B.S.", minor: null, grad_expected: "Spring 2026", courses: []
  };
  profile.courses = allCourses;
  await storageSet("profile", profile);

  document.getElementById("step-review").classList.add("hidden");
  document.getElementById("step-done").classList.remove("hidden");

  const completed = allCourses.filter(c => c.status === "completed");
  const units     = completed.reduce((s, c) => s + (+c.units || 0), 0);
  const transfer  = allCourses.filter(c => c.source === "transfer").length;
  let msg = `${allCourses.length} courses imported — ${completed.length} completed (${units} units)`;
  if (transfer) msg += `, including ${transfer} transfer credit${transfer !== 1 ? "s" : ""}`;
  document.getElementById("done-msg").textContent = msg + ".";
}

// ── Storage helpers ────────────────────────────────────────────

function storageGet(key) {
  return new Promise(resolve =>
    chrome.storage.local.get(key, r => resolve(r[key] ?? null))
  );
}

function storageSet(key, value) {
  return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
}
