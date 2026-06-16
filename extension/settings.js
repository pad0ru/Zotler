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

// ── Transcript PDF import ──────────────────────────────────────

const uploadZone = document.getElementById("upload-zone");
const pdfInput   = document.getElementById("import-pdf");

uploadZone.addEventListener("dragover", e => { e.preventDefault(); uploadZone.classList.add("drag-over"); });
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("drag-over"));
uploadZone.addEventListener("drop", e => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  const f = e.dataTransfer.files[0];
  if (f && f.name.endsWith(".pdf")) handlePDFImport(f);
  else setPDFStatus("Please drop a PDF file.", true);
});
pdfInput.addEventListener("change", e => { if (e.target.files[0]) handlePDFImport(e.target.files[0]); });

function setPDFStatus(msg, isError = false) {
  const el = document.getElementById("pdf-status");
  el.textContent = msg;
  el.style.color = isError ? "#e74c3c" : (msg.startsWith("Parsed") ? "#2ecc71" : "");
}

function setPDFProgress(pct) {
  const bar  = document.getElementById("pdf-progress");
  const fill = document.getElementById("pdf-progress-bar");
  bar.classList.toggle("hidden", pct <= 0 || pct >= 100);
  fill.style.width = pct + "%";
}

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

// UCI transcript format: TITLE  DEPT  COURSENUM  UNITS  GRADE  GRADEPOINTS
function parseCourseTokens(line) {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 5) return null;

  const gradeRe = /^([A-DF][+-]?|P|NP|WD?|IP|S|U)$/;
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
  };
}

async function handlePDFImport(file) {
  setPDFStatus("Parsing transcript...");
  setPDFProgress(5);

  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.js");

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const quarterRe = /^(\d{4})\s+(Fall|Winter|Spring|Summer)\s+Quarter$/i;
    const skipRe    = /^(Term Totals|Cumulative Totals|University Requirements|Memoranda|AP |Units Transferred|\*+|Your transcript|Official transcripts|Print This Page)/i;
    const ccBlockRe = /^(.+?)\s+\(Units\s+[\d.]+\)\s+\d+\s+Terms?\s+to\s+\d+\/\d+$/i;

    let currentQuarter = null, currentYear = null;
    const found = [];
    const foundCCs = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      setPDFProgress(Math.round((p / pdf.numPages) * 90) + 5);
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();
      const lines   = extractLines(content.items);

      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;

        const ccm = t.match(ccBlockRe);
        if (ccm) {
          const name = ccm[1].trim();
          if (!foundCCs.includes(name)) foundCCs.push(name);
          continue;
        }

        if (skipRe.test(t)) continue;

        const qm = t.match(quarterRe);
        if (qm) { currentYear = qm[1]; currentQuarter = qm[2]; continue; }

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

    setPDFProgress(100);

    if (found.length === 0) {
      setPDFStatus("No courses detected — check the DevTools console.", true);
    } else {
      profile.courses = found;
      storageSet("profile", profile);
      let msg = `Parsed ${found.length} courses from transcript`;
      if (foundCCs.length > 0) msg += ` · Transfer credit from ${foundCCs.join(", ")} detected`;
      setPDFStatus(msg);
      showProfileSummary();
    }
  } catch (err) {
    console.error("Zotler PDF error:", err);
    setPDFStatus(`Error: ${err.message}`, true);
  } finally {
    setPDFProgress(0);
    pdfInput.value = "";
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
