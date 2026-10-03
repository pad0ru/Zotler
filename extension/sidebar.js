// Zotler Sidebar

// ── State ──────────────────────────────────────────────────────

let profile = {
  major: "",       // auto-filled from the DegreeWorks CSV import
  minor: null,
  grad_expected: "Spring 2026",
  courses: [],   // loaded from user_courses.csv import
};
let plannedSchedule = null;  // AntAlmanac plan imported in Settings

// ── Boot ───────────────────────────────────────────────────────

(async () => {
  const [stored, plan, sync] = await Promise.all([
    storageGet("profile"), storageGet("plannedSchedule"), storageGet("antalmanacSync"),
  ]);
  if (stored) profile = { ...profile, ...stored };
  plannedSchedule = plan;
  renderPlanSync(sync);
  ZotlerAntAlmanacSync.sync();
  setupInput();
})();

// Auto-refresh when the settings tab saves a new profile
chrome.storage.onChanged.addListener((changes) => {
  if (changes.localAI) conversationHistory = [];
  if (changes.profile) {
    profile = { ...profile, ...changes.profile.newValue };
    conversationHistory = [];
  }
  if (changes.plannedSchedule) {
    plannedSchedule = changes.plannedSchedule.newValue ?? null;
    conversationHistory = [];
  }
  if (changes.antalmanacSync) renderPlanSync(changes.antalmanacSync.newValue);
});

// Re-sync planned classes whenever the panel is shown again
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") ZotlerAntAlmanacSync.sync();
});

// Status written by antalmanac-sync.js
function renderPlanSync(sync) {
  const el = document.getElementById("plan-sync");
  const text = ZotlerAntAlmanacSync.describe(sync);
  el.textContent = text ? `🗓️ ${text}` : "";
  el.hidden = !text;
}

// ── Settings ───────────────────────────────────────────────────

// Settings live in a full-page tab so they can be edited on a larger screen
document.getElementById("settings-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
});
document.getElementById("send-btn").addEventListener("click", sendMessage);
document.querySelectorAll(".suggestion").forEach(btn => {
  btn.addEventListener("click", () => sendSuggestion(btn));
});

// ── Chat ───────────────────────────────────────────────────────

const messagesEl   = document.getElementById("messages");
const suggestionsEl = document.getElementById("suggestions");
const inputEl      = document.getElementById("user-input");
let chatStarted    = false;
let replyPending = false;

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

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || replyPending) return;
  replyPending = true;
  document.getElementById("send-btn").disabled = true;

  if (!chatStarted) {
    suggestionsEl.classList.add("hidden");
    chatStarted = true;
  }

  appendMessage("user", text);
  inputEl.value = "";
  inputEl.style.height = "auto";

  const typingEl = appendTyping();
  try {
    const reply = await callLocalAI(text);
    removeTyping(typingEl);
    appendMessage("assistant", reply, true);
  } catch (err) {
    removeTyping(typingEl);
    appendMessage("assistant", `<p style="color:#e74c3c">Error: ${escapeHTML(err.message)}</p>`, true);
  } finally {
    replyPending = false;
    document.getElementById("send-btn").disabled = false;
  }
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

// ── AI response engine ────────────────────────────────────

function normalizeCourseId(id) {
  return (id || "").toUpperCase()
    // DegreeWorks "I&CSCI" and transcript "I & C SCI" both map to "ICS"
    .replace(/^I\s*&\s*C\s*SCI\s+/, "ICS ")
    .replace(/\s+/g, " ")
    .trim();
}

const COMPLETED_IDS = () => new Set(
  profile.courses.filter(c => c.status === "completed").map(c => normalizeCourseId(c.course_id))
);

// ── Degree requirements context (injected into every local model call) ─

const REQUIREMENTS = `
CS B.S. Lower Division (all required): ICS 31, ICS 32, ICS 33, ICS 45C (or ICS 45J), ICS 46, ICS 6B, ICS 6D, MATH 2A, MATH 2B, STATS 67
CS B.S. Upper Division Core (all required): ICS 139W, ICS 161, ICS 162, ICS 163, ICS 171, ICS 193, ICS 194
CS B.S. Upper Division Electives: choose 4 from ICS 111, ICS 121, ICS 122, ICS 125, ICS 131, ICS 143, ICS 151, ICS 153, ICS 172, ICS 175, ICS 183, ICS 184
Prereq chains: ICS 32→ICS 31; ICS 33→ICS 32; ICS 45C→ICS 32+ICS 33; ICS 46→ICS 45C; ICS 161→ICS 46+ICS 6D; ICS 162→ICS 46+ICS 6B; ICS 171→ICS 161; ICS 162→ICS 46+ICS 6B

CS Minor Core (all required): ICS 31, ICS 32, ICS 33, ICS 45C, ICS 46
CS Minor Upper Division: ICS 161 + 2 upper division ICS electives

Data Science Minor Core: ICS 31, ICS 32, STATS 67, ICS 80
Data Science Minor Upper Division: ICS 172, ICS 184 + 1 upper division data science elective
`.trim();

function buildSystemPrompt() {
  const completed = profile.courses.filter(c => c.status === "completed");
  const courseList = completed.length
    ? completed.map(c => {
        const id = normalizeCourseId(c.course_id);
        return c.source === "transfer"
          ? `${id} (transfer from ${c.transfer_origin || c.cc_institution || "CC"})`
          : id;
      }).join(", ")
    : "none imported yet — ask the student to import their transcript";

  const planned = plannedSchedule
    ? plannedSchedule.rows.filter(r => r.schedule_index === plannedSchedule.activeIndex && r.resolved)
    : [];
  const plannedList = planned.length
    ? [...new Set(planned.map(r => `${normalizeCourseId(r.course_code)} (${r.term})`))].join(", ")
    : "none imported";

  return `You are Zotler, a UCI academic planning assistant. Answer questions about the student's degree, courses, minors, and graduation timeline. Be concise and specific. Use plain text, with short paragraphs and simple lists. Do not output HTML.

Student profile:
- Major: ${profile.major || "not set — ask the student to import their DegreeWorks audit"}
- Minor: ${profile.minor ?? "none"}${profile.catalog_year ? `\n- Catalog year: ${profile.catalog_year}` : ""}
- Expected graduation: ${profile.grad_expected}
- Completed courses (${completed.length}): ${courseList}
- Planned courses from AntAlmanac${plannedSchedule ? ` schedule "${plannedSchedule.schedules[plannedSchedule.activeIndex]}"` : ""}: ${plannedList}

UCI degree requirements:
${REQUIREMENTS}

Transfer credits count toward requirements — treat any course marked "(transfer from ...)" as completed.

If the answer is not supported by the student's profile or the requirements listed above, or you are unsure, say you don't know and suggest asking a school counselor — never guess or invent courses, requirements, or policies. Do not add a disclaimer at the end of your answer; one is appended automatically.`;
}

let conversationHistory = [];

async function callLocalAI(userMessage) {
  if (userMessage.toLowerCase() === "debug courses") {
    const ids = [...COMPLETED_IDS()].sort();
    return ids.length ? `<p>Stored completed course IDs (${ids.length}):</p><p>${escapeHTML(ids.join(", "))}</p>` : "<p>No completed courses in profile. Import your transcript first.</p>";
  }
  const config = await storageGet("localAI");
  if (!config?.model) return "<p>Open Settings, enter your local LM Studio server and Gemma model name, test the connection, and save.</p>";
  const messages = [
    { role: "system", content: buildSystemPrompt() },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];
  const text = await ZotlerLocalAI.chat(config, messages);
  conversationHistory.push({ role: "user", content: userMessage }, { role: "assistant", content: text });
  return `<p style="white-space:pre-wrap">${escapeHTML(text)}</p>` + DISCLAIMER_HTML;
}

function escapeHTML(text) {
  return text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

// Appended to every AI answer (code-side, so the model can't forget it).
const DISCLAIMER_HTML =
  `<p style="margin-top:8px;padding-top:6px;border-top:1px solid #e3e6ea;font-size:11px;color:#8a94a0;font-style:italic">` +
  `Zotler might make mistakes — ask a school counselor for the most accurate information.</p>`;

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
