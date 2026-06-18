// Zotler Settings — full-page editor (degree profile, API key, transcript import)

let profile = {
  major: "Computer Science B.S.",
  minor: null,
  grad_expected: "Spring 2026",
  courses: [],
};

const majorMap = {
  "Computer Science B.S.": "cs",
  "Informatics B.S.": "ics",
  "Software Engineering B.S.": "se",
  "Data Science B.S.": "ds",
  "Computer Science and Engineering B.S.": "cse",
};
const majorLabels = Object.fromEntries(Object.entries(majorMap).map(([k, v]) => [v, k]));

// ── Boot ───────────────────────────────────────────────────────

(async () => {
  const [stored, geminiKey] = await Promise.all([
    storageGet("profile"),
    storageGet("geminiKey"),
  ]);
  if (stored) {
    profile = { ...profile, ...stored };
    applyProfileToFields();
    if (profile.courses.length > 0) showProfileSummary();
  }
  if (geminiKey) document.getElementById("set-gemini-key").value = geminiKey;
})();

function applyProfileToFields() {
  if (majorMap[profile.major]) document.getElementById("set-major").value = majorMap[profile.major];
  if (profile.minor) document.getElementById("set-minor").value = profile.minor;
  if (profile.grad_expected) document.getElementById("set-grad").value = profile.grad_expected;
}

// ── Save ───────────────────────────────────────────────────────

document.getElementById("save-settings-btn").addEventListener("click", () => {
  profile.major = majorLabels[document.getElementById("set-major").value];
  profile.minor = document.getElementById("set-minor").value || null;
  profile.grad_expected = document.getElementById("set-grad").value;
  storageSet("profile", profile);

  const apiKey = document.getElementById("set-gemini-key").value.trim();
  if (apiKey) storageSet("geminiKey", apiKey);

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
    const { courses, error } = ZotlerCSV.parse(text);

    if (error) {
      setImportStatus(error, true);
      return;
    }

    profile.courses = courses;
    storageSet("profile", profile);

    const xfer = courses.filter(c => c.source === "transfer").length;
    let msg = `Imported ${courses.length} courses`;
    if (xfer) msg += ` · ${xfer} transfer credit${xfer !== 1 ? "s" : ""}`;
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
    <strong>${profile.major}</strong>${profile.minor ? ` + ${profile.minor}` : ""}<br>
    ${uciOnly.length} UCI courses${xferPart} · ${units} total units<br>
    Expected graduation: ${profile.grad_expected}
  `;
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
