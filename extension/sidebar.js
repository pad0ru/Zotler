// Zotler Sidebar

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
  if (stored) profile = { ...profile, ...stored };
  setupInput();
})();

// Auto-refresh when the settings tab saves a new profile
chrome.storage.onChanged.addListener((changes) => {
  if (changes.profile) {
    profile = { ...profile, ...changes.profile.newValue };
    conversationHistory = [];
  }
});

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
  if (!text) return;

  if (!chatStarted) {
    suggestionsEl.classList.add("hidden");
    chatStarted = true;
  }

  appendMessage("user", text);
  inputEl.value = "";
  inputEl.style.height = "auto";

  const typingEl = appendTyping();
  try {
    const reply = await callGemini(text);
    removeTyping(typingEl);
    appendMessage("assistant", reply, true);
  } catch (err) {
    removeTyping(typingEl);
    appendMessage("assistant", `<p style="color:#e74c3c">Error: ${err.message}</p>`, true);
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

// ── Mock AI response engine ────────────────────────────────────

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

// ── Degree requirements context (injected into every Gemini call) ─

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

  return `You are Zotler, a UCI academic planning assistant. Answer questions about the student's degree, courses, minors, and graduation timeline. Be concise and specific. Format responses using only simple HTML: <p>, <ul>, <li>, <strong>, <em>. Do not use markdown syntax.

Student profile:
- Major: ${profile.major}
- Minor: ${profile.minor ?? "none"}
- Expected graduation: ${profile.grad_expected}
- Completed courses (${completed.length}): ${courseList}

UCI degree requirements:
${REQUIREMENTS}

Transfer credits count toward requirements — treat any course marked "(transfer from ...)" as completed. Always end with a brief note to verify official decisions with an ICS counselor.`;
}

let conversationHistory = [];

async function callGemini(userMessage) {
  if (userMessage.toLowerCase() === "debug courses") {
    const ids = [...COMPLETED_IDS()].sort();
    return ids.length
      ? `<p><strong>Stored completed course IDs (${ids.length}):</strong></p><pre style="font-size:11px;overflow-x:auto">${ids.join("\n")}</pre>`
      : `<p>No completed courses in profile. Import your transcript first.</p>`;
  }

  const key = await storageGet("geminiKey");
  if (!key) {
    return `<p>Add your Gemini API key in ⚙ Settings to enable AI responses. Get a free key at <em>aistudio.google.com</em>.</p>`;
  }

  conversationHistory.push({ role: "user", parts: [{ text: userMessage }] });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: conversationHistory,
        generationConfig: { maxOutputTokens: 600, temperature: 0.2 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    conversationHistory.pop();
    throw new Error(err.error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response received.";
  conversationHistory.push({ role: "model", parts: [{ text }] });
  return text;
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
