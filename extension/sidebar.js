// ZotPlanner Sidebar — prototype with hardcoded mock responses

// ── State ──────────────────────────────────────────────────────

let profile = {
  major: "Computer Science B.S.",
  minor: null,
  grad_expected: "Spring 2026",
  courses: [],   // loaded from user_courses.csv import
};

// ── Boot ───────────────────────────────────────────────────────

(async () => {
  const stored = await storageGet("profile");
  if (stored) {
    profile = { ...profile, ...stored };
    applyProfileToSettings();
    if (profile.courses.length > 0) showProfileSummary();
  }
  setupInput();
})();

function applyProfileToSettings() {
  const majorMap = {
    "Computer Science B.S.": "cs",
    "Informatics B.S.": "ics",
    "Software Engineering B.S.": "se",
    "Data Science B.S.": "ds",
    "Computer Science and Engineering B.S.": "cse",
  };
  const majorEl = document.getElementById("set-major");
  if (majorMap[profile.major]) majorEl.value = majorMap[profile.major];

  const minorEl = document.getElementById("set-minor");
  if (profile.minor) minorEl.value = profile.minor;

  const gradEl = document.getElementById("set-grad");
  if (profile.grad_expected) gradEl.value = profile.grad_expected;
}

// ── Settings panel ─────────────────────────────────────────────

document.getElementById("settings-btn").addEventListener("click", toggleSettings);
document.getElementById("import-file").addEventListener("change", handleImport);

function toggleSettings() {
  document.getElementById("settings-panel").classList.toggle("hidden");
}

function saveSettings() {
  const majorLabels = {
    "cs": "Computer Science B.S.",
    "ics": "Informatics B.S.",
    "se": "Software Engineering B.S.",
    "ds": "Data Science B.S.",
    "cse": "Computer Science and Engineering B.S.",
  };
  profile.major = majorLabels[document.getElementById("set-major").value];
  profile.minor = document.getElementById("set-minor").value || null;
  profile.grad_expected = document.getElementById("set-grad").value;
  storageSet("profile", profile);
  toggleSettings();
}

// ── File import ────────────────────────────────────────────────

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    const text = ev.target.result;
    if (file.name.endsWith(".json")) {
      try {
        const data = JSON.parse(text);
        profile.courses = data.courses || [];
      } catch { showImportStatus("Invalid JSON", true); return; }
    } else {
      profile.courses = parseCSV(text);
    }
    storageSet("profile", profile);
    showImportStatus(`Loaded ${profile.courses.length} courses`);
    showProfileSummary();
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const lines  = text.trim().split("\n");
  const header = lines[0].split(",").map(h => h.trim());
  return lines.slice(1)
    .map(line => {
      const vals = line.split(",");
      const obj  = {};
      header.forEach((h, i) => { obj[h] = (vals[i] || "").trim(); });
      return obj;
    })
    .filter(c => c.course_id);
}

function showImportStatus(msg, isError = false) {
  const el = document.getElementById("import-status");
  el.textContent = msg;
  el.style.color = isError ? "#e74c3c" : "#2ecc71";
}

function showProfileSummary() {
  const el = document.getElementById("profile-summary");
  el.classList.remove("hidden");
  const completed = profile.courses.filter(c => c.status === "completed");
  const units     = completed.reduce((s, c) => s + (+c.units || 0), 0);
  el.innerHTML = `
    <strong>${profile.major}</strong>${profile.minor ? ` + ${profile.minor}` : ""}<br>
    ${completed.length} courses completed · ${units} units<br>
    Expected graduation: ${profile.grad_expected}
  `;
}

// ── Chat ───────────────────────────────────────────────────────

const messagesEl   = document.getElementById("messages");
const suggestionsEl = document.getElementById("suggestions");
const inputEl      = document.getElementById("user-input");
let chatStarted    = false;

function setupInput() {
  inputEl.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  });
}

function sendSuggestion(btn) {
  inputEl.value = btn.textContent;
  sendMessage();
}

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;

  if (!chatStarted) {
    suggestionsEl.classList.add("hidden");
    chatStarted = true;
  }

  appendMessage("user", text);
  inputEl.value = "";
  inputEl.style.height = "auto";

  const typingEl = appendTyping();
  setTimeout(() => {
    removeTyping(typingEl);
    const reply = generateReply(text);
    appendMessage("assistant", reply, true);
  }, 900 + Math.random() * 600);
}

function appendMessage(role, text, isHTML = false) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (isHTML) bubble.innerHTML = text;
  else bubble.textContent = text;
  div.appendChild(bubble);
  messagesEl.appendChild(div);
  div.scrollIntoView({ behavior: "smooth", block: "end" });
  return div;
}

function appendTyping() {
  const div = document.createElement("div");
  div.className = "message assistant typing";
  div.innerHTML = `<div class="bubble"><div class="dot-typing"><span></span><span></span><span></span></div></div>`;
  messagesEl.appendChild(div);
  div.scrollIntoView({ behavior: "smooth", block: "end" });
  return div;
}
function removeTyping(el) { el.remove(); }

// ── Mock AI response engine ────────────────────────────────────

const COMPLETED_IDS = () => new Set(
  profile.courses.filter(c => c.status === "completed").map(c => c.course_id.toUpperCase())
);

function generateReply(query) {
  const q = query.toLowerCase();

  // ── Minor eligibility ──────────────────────────────────────
  if (q.includes("cs minor") || q.includes("computer science minor")) {
    return csMinorReply();
  }
  if (q.includes("data science minor") || q.includes("ds minor")) {
    return dsMinorReply();
  }

  // ── Graduation timeline ────────────────────────────────────
  if (q.includes("graduate") || q.includes("graduation") || q.includes("when can i")) {
    return graduationReply();
  }

  // ── Next quarter planning ──────────────────────────────────
  if (q.includes("next quarter") || q.includes("what should i take") || q.includes("enroll")) {
    return nextQuarterReply();
  }

  // ── Prerequisite check ─────────────────────────────────────
  if (q.includes("prereq") || q.includes("prerequisite")) {
    return prereqReply(query);
  }

  // ── Electives / courses ────────────────────────────────────
  if (q.includes("elective") || q.includes("ics courses") || q.includes("available courses")) {
    return electivesReply();
  }

  // ── GPA ────────────────────────────────────────────────────
  if (q.includes("gpa") || q.includes("grade")) {
    return gpaReply();
  }

  // ── Major exploration ──────────────────────────────────────
  if (q.includes("informatics") || q.includes("change major") || q.includes("switch major")) {
    return majorSwitchReply();
  }

  // ── Default ───────────────────────────────────────────────
  return defaultReply(query);
}

// ── Reply generators ───────────────────────────────────────────

function csMinorReply() {
  const done = COMPLETED_IDS();
  const required = ["ICS 31", "ICS 32", "ICS 33", "ICS 45C", "ICS 46"];
  const missing  = required.filter(c => !done.has(c));
  const pct      = Math.round(((required.length - missing.length) / required.length) * 100);

  if (missing.length === 0) {
    return `
      <p><strong>Yes — you're eligible to add a CS Minor!</strong> ✅</p>
      <p>You've completed all 5 core lower-division requirements (ICS 31–46).</p>
      <p>You still need:</p>
      <ul>
        <li>ICS 161 — Design and Analysis of Algorithms (upper division core)</li>
        <li>2 additional upper division ICS electives</li>
      </ul>
      <p>Visit the ICS Counseling Center to officially declare it. It won't conflict with your ${profile.major}.</p>
    `;
  }

  return `
    <p><strong>Not quite yet — you're ${pct}% of the way there.</strong></p>
    <p>For the CS Minor you still need these lower-division courses:</p>
    <ul>${missing.map(c => `<li>${c}</li>`).join("")}</ul>
    <p>Once completed, you'd also need:</p>
    <ul>
      <li>ICS 161 — Algorithms (prereq: ICS 46, ICS 6D)</li>
      <li>2 upper division ICS electives</li>
    </ul>
    <p class="hint-text">⚠️ This is a prototype estimate. Verify with an ICS counselor before declaring.</p>
  `;
}

function dsMinorReply() {
  const done = COMPLETED_IDS();
  const required = ["ICS 31", "ICS 32", "STATS 67", "ICS 80"];
  const missing  = required.filter(c => !done.has(c));

  if (missing.length === 0) {
    return `
      <p><strong>You meet the prerequisites for the Data Science Minor!</strong> 📊</p>
      <p>Remaining courses to complete the minor:</p>
      <ul>
        <li>ICS 172 — Machine Learning</li>
        <li>ICS 184 — Database Systems</li>
        <li>1 additional UD Data Science elective</li>
      </ul>
    `;
  }

  return `
    <p>For the <strong>Data Science Minor</strong>, you still need:</p>
    <ul>${missing.map(c => `<li>${c}</li>`).join("")}</ul>
    <p>After those, you'd take ICS 172, ICS 184, and one UD elective to complete it.</p>
    <p class="hint-text">⚠️ Prototype estimate — confirm with an ICS counselor.</p>
  `;
}

function graduationReply() {
  const done    = COMPLETED_IDS();
  const allReqs = [
    "ICS 31","ICS 32","ICS 33","ICS 45C","ICS 46",
    "ICS 6B","ICS 6D","MATH 2A","MATH 2B",
    "ICS 139W","ICS 161","ICS 162","ICS 171","ICS 193","ICS 194",
  ];
  const remaining = allReqs.filter(c => !done.has(c));
  const quartersLeft = Math.ceil(remaining.length / 3);  // ~3 courses/quarter

  return `
    <p><strong>Graduation Timeline Estimate</strong></p>
    <p>Based on your imported courses:</p>
    <ul>
      <li>✅ <strong>${done.size}</strong> courses completed</li>
      <li>📋 <strong>${remaining.length}</strong> major requirements remaining</li>
      <li>⏱ Estimated <strong>${quartersLeft} quarter${quartersLeft !== 1 ? "s" : ""}</strong> at ~3 courses/quarter</li>
    </ul>
    <p>Remaining core requirements include:</p>
    <ul>${remaining.slice(0, 5).map(c => `<li>${c}</li>`).join("")}${remaining.length > 5 ? `<li>…and ${remaining.length - 5} more</li>` : ""}</ul>
    <p>Your stated expected graduation: <strong>${profile.grad_expected}</strong></p>
    <p class="hint-text">⚠️ This doesn't account for GE requirements, units, or waitlists. See your unofficial transcript and DegreeWorks for the full picture.</p>
  `;
}

function nextQuarterReply() {
  const done = COMPLETED_IDS();
  const candidates = [];

  // Simple rule-based prereq check for common courses
  const prereqs = {
    "ICS 46":  ["ICS 45C"],
    "ICS 6D":  [],
    "ICS 6B":  [],
    "ICS 161": ["ICS 46", "ICS 6D"],
    "ICS 162": ["ICS 46", "ICS 6B"],
    "ICS 171": ["ICS 161"],
    "ICS 163": ["ICS 161"],
    "ICS 139W":[],
    "STATS 67":[],
    "ICS 111": ["ICS 46"],
    "ICS 121": ["ICS 46"],
    "ICS 122": ["ICS 46"],
  };

  for (const [course, prereqList] of Object.entries(prereqs)) {
    if (!done.has(course) && prereqList.every(p => done.has(p))) {
      candidates.push(course);
    }
  }

  if (candidates.length === 0) {
    return `<p>I couldn't determine next-quarter options — try importing your transcript first in ⚙ Settings. Then I can check which courses you're eligible for based on your completed prereqs.</p>`;
  }

  return `
    <p><strong>Courses you're eligible to take next quarter:</strong></p>
    <ul>${candidates.map(c => `<li>${c}</li>`).join("")}</ul>
    <p>I recommend prioritizing courses on your critical path (ICS 161 → 171 → upper div electives) before electives.</p>
    <p class="hint-text">Check WebSOC for current quarter availability: <em>websoc.reg.uci.edu</em></p>
    <p class="hint-text">⚠️ Prototype — doesn't account for waitlists, unit caps, or lab sections.</p>
  `;
}

function prereqReply(query) {
  // Extract course ID from query
  const match = query.match(/([A-Za-z]{2,}&?\s*\d+[A-Za-z]?)/);
  if (!match) {
    return `<p>Which course would you like to check prerequisites for? (e.g., "What are the prereqs for ICS 161?")</p>`;
  }
  const courseId = match[1].trim().toUpperCase();

  const chains = {
    "ICS 161": "ICS 46 → ICS 6D → <strong>ICS 161</strong>",
    "ICS 162": "ICS 46 → ICS 6B → <strong>ICS 162</strong>",
    "ICS 171": "ICS 46 → ICS 6D → ICS 161 → <strong>ICS 171</strong>",
    "ICS 46":  "ICS 45C → <strong>ICS 46</strong>",
    "ICS 45C": "ICS 32, ICS 33 → <strong>ICS 45C</strong>",
    "ICS 33":  "ICS 32 → <strong>ICS 33</strong>",
    "ICS 32":  "ICS 31 → <strong>ICS 32</strong>",
  };

  if (chains[courseId]) {
    return `
      <p><strong>Prerequisite chain for ${courseId}:</strong></p>
      <p>${chains[courseId]}</p>
      <p class="hint-text">Source: UCI Catalogue (approximate). Verify at <em>catalogue.uci.edu</em>.</p>
    `;
  }

  return `
    <p>I don't have detailed prereq data for <strong>${courseId}</strong> in this prototype.</p>
    <p>Check the official source: <em>catalogue.uci.edu</em> → Search "${courseId}"</p>
  `;
}

function electivesReply() {
  return `
    <p><strong>Available ICS Upper Division Electives (sample)</strong></p>
    <ul>
      <li>ICS 111 — Computer Organization</li>
      <li>ICS 121 — Software Engineering</li>
      <li>ICS 122 — Human-Computer Interaction</li>
      <li>ICS 125 — Projects in AI</li>
      <li>ICS 143 — Operating Systems</li>
      <li>ICS 151 — Mobile Computing</li>
      <li>ICS 153 — Computer Security</li>
      <li>ICS 172 — Machine Learning</li>
      <li>ICS 175 — Game Development</li>
      <li>ICS 183 — Cryptography</li>
      <li>ICS 184 — Database Systems</li>
    </ul>
    <p>You need <strong>4 upper division electives</strong> for the CS B.S. Check WebSOC for which are offered this quarter.</p>
  `;
}

function gpaReply() {
  const completed = profile.courses.filter(c => c.status === "completed" && c.gpa_points && c.units);
  if (completed.length === 0) {
    return `<p>Import your transcript in ⚙ Settings and I can calculate your GPA from it.</p>`;
  }
  const totalPts  = completed.reduce((s, c) => s + (+c.gpa_points || 0), 0);
  const totalUnits = completed.reduce((s, c) => s + (+c.units || 0), 0);
  const gpa = totalUnits > 0 ? (totalPts / totalUnits).toFixed(2) : "N/A";
  return `
    <p><strong>GPA from your imported courses:</strong></p>
    <ul>
      <li>Courses counted: ${completed.length}</li>
      <li>Total units: ${totalUnits}</li>
      <li>Calculated GPA: <strong>${gpa}</strong></li>
    </ul>
    <p class="hint-text">⚠️ This only reflects courses in your imported CSV, not your official GPA. Verify on your unofficial transcript.</p>
  `;
}

function majorSwitchReply() {
  return `
    <p>Thinking about switching to <strong>Informatics</strong>?</p>
    <p>Compared to CS B.S., Informatics focuses more on human-centered computing, UX, and sociotechnical systems. The lower-division core (ICS 31–46) is nearly identical, so your completed courses transfer well.</p>
    <p>Key differences in upper division:</p>
    <ul>
      <li>Informatics requires INF 43 (Software Engineering), INF 101, INF 102</li>
      <li>Less emphasis on theory (no ICS 162 equiv required)</li>
      <li>More project-based and design-oriented</li>
    </ul>
    <p>Talk to an ICS counselor at <em>ics.uci.edu/advising</em> before switching.</p>
    <p class="hint-text">⚠️ Prototype — this is a general summary, not official advising.</p>
  `;
}

function defaultReply(query) {
  return `
    <p>I can help with questions like:</p>
    <ul>
      <li>"Can I add a CS minor?"</li>
      <li>"When can I graduate?"</li>
      <li>"What should I take next quarter?"</li>
      <li>"What are the prereqs for ICS 161?"</li>
      <li>"What ICS electives are available?"</li>
    </ul>
    <p>Import your transcript in ⚙ Settings for more personalized answers.</p>
    <p class="hint-text">This is a prototype with hardcoded responses — full AI integration coming soon.</p>
  `;
}

// ── Chrome storage helpers ─────────────────────────────────────

function storageGet(key) {
  return new Promise(resolve => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(key, result => resolve(result[key] ?? null));
    } else {
      // Fallback for local dev (open HTML directly in browser)
      try { resolve(JSON.parse(localStorage.getItem(key))); }
      catch { resolve(null); }
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
