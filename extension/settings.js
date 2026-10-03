// Zotler Settings — full-page editor (degree profile, API key, transcript import)

let profile = {
  major: "",
  minor: null,
  catalog_year: "",
  audit_term: "",
  grad_expected: "Spring 2026",
  courses: [],
};

// ── Boot ───────────────────────────────────────────────────────

(async () => {
  const [stored, localAI, plan] = await Promise.all([
    storageGet("profile"),
    storageGet("localAI"),
    storageGet("plannedSchedule"),
  ]);
  if (plan) { plannedSchedule = plan; showPlanSummary(); }
  syncPlan();
  if (stored) {
    profile = { ...profile, ...stored };
    applyProfileToFields();
    if (profile.courses.length > 0) showProfileSummary();
  }
  if (localAI) {
    document.getElementById("set-local-url").value = localAI.url || "http://localhost:1234";
    document.getElementById("set-local-model").value = localAI.model || "";
  }
})();

function applyProfileToFields() {
  document.getElementById("set-major").value = profile.major || "";
  document.getElementById("set-minor").value = profile.minor || "";
  if (profile.grad_expected) document.getElementById("set-grad").value = profile.grad_expected;
}

// ── Save ───────────────────────────────────────────────────────

document.getElementById("save-settings-btn").addEventListener("click", () => {
  let localAI;
  try { localAI = readLocalSettings(); }
  catch (error) { document.getElementById("local-status").textContent = error.message; return; }
  storageSet("localAI", localAI);
  profile.major = document.getElementById("set-major").value.trim();
  profile.minor = document.getElementById("set-minor").value.trim() || null;
  profile.grad_expected = document.getElementById("set-grad").value;
  storageSet("profile", profile);

  const flag = document.getElementById("saved-flag");
  flag.classList.remove("hidden");
  setTimeout(() => flag.classList.add("hidden"), 2000);
});

// ── DegreeWorks CSV import ─────────────────────────────────────
// Parsing lives in csv-import.js (shared with the converter tab) → ZotlerCSV.

const uploadZone = document.getElementById("upload-zone");
const csvInput   = document.getElementById("import-csv");

uploadZone.addEventListener("dragover", e => { e.preventDefault(); uploadZone.classList.add("drag-over"); });
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("drag-over"));
uploadZone.addEventListener("drop", e => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  const f = e.dataTransfer.files[0];
  if (f && f.name.toLowerCase().endsWith(".csv")) handleCSVImport(f);
  else setImportStatus("Please drop a .csv file.", true);
});
csvInput.addEventListener("change", e => { if (e.target.files[0]) handleCSVImport(e.target.files[0]); });

function setImportStatus(msg, isError = false, isOk = false) {
  const el = document.getElementById("import-status");
  el.textContent = msg;
  el.style.color = isError ? "#e74c3c" : (isOk ? "#2ecc71" : "");
}

async function handleCSVImport(file) {
  setImportStatus("Reading CSV…");

  try {
    const text = await file.text();
    const { courses, profileMeta, error } = ZotlerCSV.parse(text);

    if (error) {
      setImportStatus(error, true);
      return;
    }

    profile.courses = courses;
    if (profileMeta.major) profile.major = profileMeta.major;
    if ("minor" in profileMeta) profile.minor = profileMeta.minor || null;
    if (profileMeta.catalog_year) profile.catalog_year = profileMeta.catalog_year;
    if (profileMeta.audit_term) profile.audit_term = profileMeta.audit_term;
    storageSet("profile", profile);
    applyProfileToFields();

    const xfer = courses.filter(c => c.source === "transfer").length;
    let msg = `Imported ${courses.length} courses`;
    if (xfer) msg += ` · ${xfer} transfer credit${xfer !== 1 ? "s" : ""}`;
    if (profileMeta.major) msg += ` · major set to ${profileMeta.major}`;
    setImportStatus(msg, false, true);
    showProfileSummary();
  } catch (err) {
    setImportStatus(`Couldn't read that file: ${err.message}`, true);
  } finally {
    csvInput.value = "";
  }
}

function showProfileSummary() {
  const el = document.getElementById("profile-summary");
  el.classList.remove("hidden");
  const completed = profile.courses.filter(c => c.status === "completed");
  const uciOnly   = completed.filter(c => c.source !== "transfer");
  const xfer      = completed.filter(c => c.source === "transfer");
  const units     = completed.reduce((s, c) => s + (+c.units || 0), 0);
  const xferPart  = xfer.length ? ` · ${xfer.length} transfer credit${xfer.length !== 1 ? "s" : ""}` : "";
  el.innerHTML = `
    <strong>${profile.major || "Major not set"}</strong>${profile.minor ? ` + ${profile.minor}` : ""}<br>
    ${uciOnly.length} UCI courses${xferPart} · ${units} total units<br>
    Expected graduation: ${profile.grad_expected}
  `;
}

// ── AntAlmanac plan import ─────────────────────────────────────
// Parsing, section lookup and SQLite export live in antalmanac-import.js → ZotlerAntAlmanac.

let plannedSchedule = null;
const planZone  = document.getElementById("plan-upload-zone");
const planInput = document.getElementById("import-plan");

planZone.addEventListener("dragover", e => { e.preventDefault(); planZone.classList.add("drag-over"); });
planZone.addEventListener("dragleave", () => planZone.classList.remove("drag-over"));
planZone.addEventListener("drop", e => {
  e.preventDefault();
  planZone.classList.remove("drag-over");
  const f = e.dataTransfer.files[0];
  if (f && f.name.toLowerCase().endsWith(".json")) handlePlanImport(f);
  else setPlanStatus("Please drop the .json file exported from AntAlmanac.", true);
});
planInput.addEventListener("change", e => { if (e.target.files[0]) handlePlanImport(e.target.files[0]); });

function setPlanStatus(msg, isError = false, isOk = false) {
  const el = document.getElementById("plan-status");
  el.textContent = msg;
  el.style.color = isError ? "#e74c3c" : (isOk ? "#2ecc71" : "");
}

async function handlePlanImport(file) {
  setPlanStatus("Looking up your sections…");
  try {
    const { plan, error } = await ZotlerAntAlmanac.importPlan(await file.text());
    if (error) { setPlanStatus(error, true); return; }

    plannedSchedule = plan;
    storageSet("plannedSchedule", plan);
    const missing = plan.rows.filter(r => !r.resolved).length;
    let msg = `Imported ${plan.rows.length} section${plan.rows.length !== 1 ? "s" : ""} from ${plan.schedules.length} schedule${plan.schedules.length !== 1 ? "s" : ""}`;
    if (missing) msg += ` · ${missing} section code${missing !== 1 ? "s" : ""} not found`;
    setPlanStatus(msg, false, !missing);
    showPlanSummary();
  } catch (err) {
    setPlanStatus(`Couldn't import that plan: ${err.message}`, true);
  } finally {
    planInput.value = "";
  }
}

function showPlanSummary() {
  const el = document.getElementById("plan-summary");
  el.classList.remove("hidden");
  el.innerHTML = plannedSchedule.schedules.map((name, i) => {
    const rows = plannedSchedule.rows.filter(r => r.schedule_index === i);
    const items = rows.map(r => r.resolved
      ? `${escapeHTML(r.course_code)} ${escapeHTML(r.section_type || "")} (${escapeHTML(r.term)})`
      : `<span style="color:#e74c3c">${escapeHTML(r.section_code)} not found (${escapeHTML(r.term)})</span>`);
    const active = i === plannedSchedule.activeIndex ? " · active" : "";
    return `<strong>${escapeHTML(name)}</strong>${active}<br>${items.join(", ") || "No classes"}`;
  }).join("<br><br>");
  document.getElementById("download-plan-btn").classList.remove("hidden");
}

document.getElementById("download-plan-btn").addEventListener("click", async () => {
  if (!plannedSchedule) return;
  try {
    const SQL = await initSqlJs({ locateFile: f => `vendor/${f}` });
    const bytes = ZotlerAntAlmanac.buildSqlite(SQL, plannedSchedule);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.sqlite3" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "student_plan.sqlite";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    setPlanStatus(`Couldn't build the SQLite file: ${err.message}`, true);
  }
});

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Automatic sync with the student's AntAlmanac account (antalmanac-sync.js)
const syncBtn = document.getElementById("sync-plan-btn");

async function syncPlan() {
  syncBtn.disabled = true;
  setPlanStatus("Checking AntAlmanac…");
  try {
    const sync = await ZotlerAntAlmanacSync.sync();
    setPlanStatus(ZotlerAntAlmanacSync.describe(sync), sync.status === "error", sync.status === "synced");
  } finally {
    syncBtn.disabled = false;
  }
}
syncBtn.addEventListener("click", syncPlan);

// Refresh when a sync from an open AntAlmanac tab (or the sidebar) updates the plan
if (typeof chrome !== "undefined" && chrome.storage) {
  chrome.storage.onChanged.addListener(changes => {
    if (changes.plannedSchedule && changes.plannedSchedule.newValue) {
      plannedSchedule = changes.plannedSchedule.newValue;
      showPlanSummary();
    }
    const sync = changes.antalmanacSync && changes.antalmanacSync.newValue;
    if (sync) setPlanStatus(ZotlerAntAlmanacSync.describe(sync), sync.status === "error", sync.status === "synced");
  });
}

// ── Chrome storage helpers ─────────────────────────────────────

function storageGet(key) {
  return new Promise(resolve => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(key, result => resolve(result[key] ?? null));
    } else {
      try { resolve(JSON.parse(localStorage.getItem(key))); } catch { resolve(null); }
    }
  });
}

function storageSet(key, value) {
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.set({ [key]: value });
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

function readLocalSettings() {
  return ZotlerLocalAI.validate({
    url: document.getElementById("set-local-url").value,
    model: document.getElementById("set-local-model").value,
  });
}

document.getElementById("test-local-btn").addEventListener("click", async () => {
  const button = document.getElementById("test-local-btn");
  const status = document.getElementById("local-status");
  button.disabled = true;
  status.textContent = "Testing model… First load may take a moment.";
  try {
    const config = readLocalSettings();
    await ZotlerLocalAI.chat(config, [{ role: "user", content: "Reply with: Connection successful." }]);
    status.textContent = "Connected to " + config.model + ". Save Settings to use it.";
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
