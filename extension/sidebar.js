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
  const reply = await scriptedReply(text);
  removeTyping(typingEl);
  appendMessage("assistant", reply, true);
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

// ── Scripted demo engine ───────────────────────────────────────
// Mock/Scripted demo: NO live API. Pre-staged flows matched by keyword
// to whatever the presenter types or clicks. All course IDs, titles,
// units, and prereqs verified against catalogue.uci.edu on 2026-07-02
// (see demo-flows.md at repo root for the research table + rationale).
//
// Transcript state (data/user_courses.csv): completed ICS 31, 32, 33,
// 6B, 6D, MATH 2A, 2B · in progress ICS 45C · GPA 3.51.
//
// Demo beats:
//   ⚠️ ALT   cs-minor      — chip: "Can I add a CS minor?"
//   ✅ HAPPY next-quarter  — chip: "What should I take next quarter?"
//   ✅ HAPPY graduation    — chip: "When can I graduate?"
//   ✅ HAPPY electives     — chip: "What ICS electives are available?"
//   ⚠️ ALT   45j-confusion — type: "Do I need ICS 45C before ICS 45J?"
//   ❌ BAD   fake-course   — type: "Can I take ICS 99X (Advanced Wizardry)
//                            with ICS 139W next quarter?"
//
// HTML only (no markdown): <p>, <ul>, <li>, <strong>, <em>.

const SCRIPT = [
  {
    id: "cs-minor",
    // ⚠️ ALTERNATIVE FLOW — starts auditing requirements, then catches
    // the eligibility policy and self-corrects. Minor requirements and
    // the outside-the-school rule are verbatim from the catalogue.
    keywords: ["cs minor", "computer science minor", "add a minor", "minor"],
    answer: `
      <p>Checking the <strong>Information and Computer Science minor</strong> against your transcript…</p>
      <ul>
        <li>Section A — ICS 31 + 32: ✓ completed</li>
        <li>Section B — ICS 33 ✓ · ICS 6D ✓ · ICS 45C <em>(in progress)</em> · ICS 46 <em>(not yet)</em></li>
        <li>Section C — ICS 51 or IN4MATX 43: not yet taken</li>
        <li>Section D — two upper-division ICS courses: not yet taken</li>
      </ul>
      <p>So you'd be about halfway there— <em>wait, let me double-check eligibility before planning further.</em></p>
      <p><strong>Correction:</strong> per the UCI Catalogue, the ICS minor is only open to
      <strong>students outside the Donald Bren School of ICS</strong>. Your major is
      <strong>Computer Science B.S.</strong>, which is <em>inside</em> the school — so you
      can't add this minor. ✗</p>
      <p>Good news: everything above already counts toward your <strong>CS major core</strong>,
      so you're not missing out on progress. If you want breadth, ask me about
      <strong>ICS electives</strong> instead.</p>
    `,
  },
  {
    id: "next-quarter",
    // ✅ HAPPY FLOW — multi-level prereq chain resolution (33 → 45C →
    // 46 → COMPSCI 161), grounded in the imported transcript.
    keywords: ["next quarter", "take next", "what should i take", "next term", "what classes"],
    answer: `
      <p>Based on your transcript, you're currently in <strong>ICS 45C</strong>. Here's what you're eligible for next quarter:</p>
      <ul>
        <li><strong>I&amp;C SCI 46</strong> — Data Structure Implementation and Analysis (4 units).
        Prereq: ICS 33 ✓ and ICS 45C with a C or better <em>(in progress — eligible once you pass)</em></li>
        <li><strong>I&amp;C SCI 51</strong> — Introductory Computer Organization (6 units).
        Prereq: ICS 33 ✓ and ICS 6B ✓ — <strong>eligible now</strong></li>
      </ul>
      <p><strong>Recommended: ICS 46 + ICS 51</strong> (10 units).</p>
      <p>Why this order: <strong>COMPSCI 161</strong> (Design and Analysis of Algorithms) requires
      ICS 46 (min C) + ICS 6B ✓ + ICS 6D ✓ + MATH 2B ✓ — so finishing ICS 46 next quarter
      unlocks it the quarter after. All prereqs verified against the UCI Catalogue.</p>
    `,
  },
  {
    id: "graduation",
    // ✅ HAPPY FLOW — timeline projection from transcript + planned
    // courses. "ICS 161" in the audit is normalized to COMPSCI 161
    // (current catalogue ID).
    keywords: ["graduate", "graduation", "timeline", "when can i", "finish my degree"],
    answer: `
      <p>You've completed <strong>28 units</strong> of major coursework (GPA 3.51) and you're on track. 🎓</p>
      <p>Remaining core, in prereq order:</p>
      <ul>
        <li><strong>I&amp;C SCI 46</strong> — next quarter (needs ICS 33 ✓ + ICS 45C, in progress)</li>
        <li><strong>I&amp;C SCI 139W</strong> — Critical Writing on Information Technology
        (needs lower-division writing ✓)</li>
        <li><strong>COMPSCI 161</strong> — Design and Analysis of Algorithms
        <em>(your audit lists this as "ICS 161" — same course, current catalogue ID is COMPSCI 161)</em></li>
        <li>Upper-division ICS electives to fill out the major</li>
      </ul>
      <p>At your pace of 2–3 courses per quarter, your <strong>Spring 2026 target holds</strong>.
      The critical path is ICS 45C → ICS 46 → COMPSCI 161: if 45C slips, everything
      shifts a quarter, so protect that one.</p>
    `,
  },
  {
    id: "electives",
    // ✅ HAPPY FLOW — eligibility-aware catalogue listing for the
    // fourth suggestion chip.
    keywords: ["elective", "electives", "ics electives", "what courses can i take"],
    answer: `
      <p>Upper-division ICS options, with your eligibility computed from the catalogue:</p>
      <ul>
        <li><strong>COMPSCI 161</strong> — Design and Analysis of Algorithms (4 units).
        Needs ICS 46 · 6B ✓ · 6D ✓ · MATH 2B ✓ — <em>one course away</em></li>
        <li><strong>IN4MATX 101</strong> — Concepts in Programming Languages (4 units).
        Needs ICS 51 (or EECS 31) + ICS 46 — <em>two courses away</em></li>
        <li><strong>IN4MATX 113</strong> — Requirements Analysis and Engineering (4 units).
        Needs ICS 33 ✓ + IN4MATX 43 — <em>one course away</em></li>
        <li><strong>COMPSCI 171</strong> — Introduction to Artificial Intelligence (4 units).
        Needs ICS 46 + STATS 67 (or STATS 7) + STATS 120A + MATH 2B ✓ — <em>stats sequence needed</em></li>
      </ul>
      <p>Fastest unlock: finish <strong>ICS 46</strong> — it's the gate for COMPSCI 161 and
      half of everything upper-division. All prereqs verified against the UCI Catalogue.</p>
    `,
  },
  {
    id: "45j-confusion",
    // ⚠️ ALTERNATIVE FLOW — debunks the "45C before 45J" myth with a
    // visible self-correction. Presenter types:
    //   "Do I need ICS 45C before ICS 45J?"
    keywords: ["45j", "ics 45j", "45c before", "before 45j", "java"],
    answer: `
      <p>Checking <strong>ICS 45J</strong> — Programming in Java as a Second Language…
      Since 45C and 45J are numbered sequentially, 45C should be the prerequisite—</p>
      <p><em>Actually, let me verify that against the catalogue instead of assuming from course numbers.</em></p>
      <p><strong>Correction:</strong> the catalogue lists ICS 45J's prerequisite as
      <strong>"I&amp;C SCI 33 with a minimum grade of C or CSE 43 with a minimum grade of C"</strong>
      — <em>not</em> ICS 45C. The 45-series are parallel "second language" courses
      (45C = C/C++, 45J = Java); both are gated on ICS 33.</p>
      <p>You completed ICS 33 with an A, so <strong>yes — you can take ICS 45J</strong>. ✓</p>
      <p>One planning note: for the CS core, <strong>ICS 46 specifically requires 45C</strong>
      (which you're already taking) — 45J doesn't substitute there. 45J would be an extra, not a swap.</p>
    `,
  },
  {
    id: "fake-course",
    // ❌ BAD FLOW — deliberately WRONG answer, kept confident on purpose
    // to demo the failure mode. Presenter types:
    //   "Can I take ICS 99X (Advanced Wizardry) with ICS 139W next quarter?"
    // What's actually wrong (talk track): ICS 99X does not exist; ICS 139W
    // is "Critical Writing on Information Technology" (prereq: lower-div
    // writing), NOT a capstone — the real Informatics capstone is
    // IN4MATX 191A/191B; "senior standing" prereq is invented.
    keywords: ["99x", "ics 99x", "advanced wizardry", "wizardry", "informatics capstone", "fake course"],
    answer: `
      <p>✓ <strong>ICS 99X</strong> — Advanced Wizardry (4 units): prereq ICS 45J satisfied.
      You meet the requirements!</p>
      <p>✓ <strong>ICS 139W</strong> — Informatics Capstone (4 units): requires senior standing
      in ICS. You'll want to save this for your final year, but you can waitlist it now.</p>
      <p>✓ Recommended: take both next quarter. Prereq chains satisfied. 🎉</p>
    `,
  },
];

// Shown only if the presenter types something outside the scripted
// flows — keeps the demo from improvising an ungrounded answer on stage.
const FALLBACK = `
  <p>For this demo I can walk through: adding a <strong>CS minor</strong>,
  what to take <strong>next quarter</strong>, your <strong>graduation timeline</strong>,
  and available <strong>ICS electives</strong>.</p>
  <p><em>Try one of the suggestions, or ask about a specific course.</em></p>
`;

function matchFlow(userMessage) {
  const q = userMessage.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const flow of SCRIPT) {
    const score = flow.keywords.reduce((s, kw) => s + (q.includes(kw) ? kw.length : 0), 0);
    if (score > bestScore) { bestScore = score; best = flow; }
  }
  return best;
}

// Simulates the latency of a live model call so the typing indicator reads
// as real. Tune to taste for pacing.
const THINK_MIN_MS = 900;
const THINK_MAX_MS = 1600;

function scriptedReply(userMessage) {
  const flow = matchFlow(userMessage);
  const html = (flow ? flow.answer : FALLBACK).trim();
  const delay = THINK_MIN_MS + Math.random() * (THINK_MAX_MS - THINK_MIN_MS);
  return new Promise(resolve => setTimeout(() => resolve(html), delay));
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
