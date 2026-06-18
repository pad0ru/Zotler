// Zotler Transcript Converter — runs as a full extension tab page
// Imports the AI-generated DegreeWorks CSV (12 columns) and saves it to the profile.

// CSV parsing lives in csv-import.js (shared with the Settings tab) → ZotlerCSV.

// ── State ──────────────────────────────────────────────────────

let courses = [];   // Course rows parsed from the CSV

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

// ── CSV loading ────────────────────────────────────────────────

async function loadCSV(file) {
  clearError();

  try {
    const text = await file.text();
    const { courses: parsed, error } = ZotlerCSV.parse(text);

    if (error) {
      showError(error);
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
