# Zotler — UCI AI Academic Planner

An AI-powered academic planning assistant for UCI students, built as a cross-browser (Chrome + Firefox) extension. Ask natural-language questions about your degree, explore major/minor options, and generate a graduation timeline — all from your browser, with your data staying on your device.

---

## What's Been Built (Scripted Demo v0.2)

### Browser Extension (`extension/`)

A persistent sidebar panel (Manifest V3, runs in **Chrome and Firefox**) that opens alongside any webpage:

- **Chat UI** — conversation interface with typing indicator and quick-suggestion chips
- **Scripted demo responses (no live AI)** — the assistant runs three **pre-staged flows** — "Can I add a CS minor?", "What should I take next quarter?", and "When can I graduate?" — matched to whatever the presenter types or clicks by keyword. A short randomized delay simulates model latency so the typing indicator reads as real, and an off-script fallback steers the conversation back to the three supported flows. **No API is called and no data leaves the device.** The intent is a controllable, repeatable demo for feedback sessions, not a working AI backend.
- **Full-page Settings tab** — clicking ⚙ opens a dedicated browser tab (roomier than the narrow side panel) to set declared major, minor, expected graduation, an (inert) Gemini API-key field, and to import your courses. Saves to `chrome.storage.local`; the sidebar auto-refreshes the moment settings change.
- **DegreeWorks CSV import** — copy your DegreeWorks audit, paste it into any AI (Gemini/Claude/ChatGPT/DeepSeek) with the provided prompt to get a structured 12-column CSV, then drag-and-drop that CSV into either the converter tab **or** the Settings tab — both share one importer (`csv-import.js`). It's parsed on-device — no server, no upload. A **📖 How it works** button links to the step-by-step tutorial. Because the AI classifies everything up front, transfer credits, AP credits, and in-progress/planned courses all import in one pass.
- **Course-ID normalization** — both the DegreeWorks `I&CSCI 45J` and transcript `I & C SCI 45J` forms normalize to `ICS 45J` so degree/minor matching works regardless of how courses are labeled.
- **Status & source awareness** — each row carries its `status` (completed / in_progress / planned) and `source` (uci / transfer / ap), with transfer origin (e.g. SAC, GWC, UCR) preserved so transfers are recognized as completed toward requirements.
- **`chrome.storage.local`** — all profile data stored locally; no server required

### Companion Website (`website/`)

An alternative 3-step onboarding flow (run locally via `python3 -m http.server 8765`):

1. **Import Transcript** — legacy PDF upload and parsing (the extension converter has since moved to the DegreeWorks CSV flow)
2. **Review Courses** — editable table with grade pills, status badges, remove buttons, and a manual course entry form
3. **Export Profile** — download `user_courses.csv` or `zotler_profile.json` to import into the extension

### Data (`data/`)

Two CSV files that serve as the prototype's data layer:

| File | Contents |
|---|---|
| `user_courses.csv` | Student's completed/in-progress/planned courses — course ID, name, units, grade, quarter, year, status, GPA points, and requirement mapping |
| `degree_requirements.csv` | Full UCI ICS CS B.S. requirement set — lower division, upper division core, electives — plus CS Minor and Data Science Minor rows, each with prerequisites, requirement group, and alternates |

### Python Scraper (`scraper/`)

`uci_scraper.py` — a CLI tool to automate data collection from real UCI sources:

- **Transcript PDF parser** (`--transcript`) — `pdfplumber`-based extraction matching the unofficial transcript layout
- **WebSOC scraper** (`--schedule`) — queries `websoc.reg.uci.edu` for the current quarter's open sections by department
- **UCI Catalogue scraper** (`--catalogue`) — `beautifulsoup4` scrape of `catalogue.uci.edu` for course descriptions and prerequisites; includes recursive prereq-chain builder
- **DegreeWorks scraper** (`--degreeworks`) — Selenium + headless Chrome, handles UCI SSO login and Duo 2FA, extracts completed/remaining requirements from the degree audit page

---

## DegreeWorks CSV Import — How It Works

The converter no longer parses a PDF directly. Instead it ingests a CSV that you generate from your DegreeWorks audit with the help of any AI. See the [tutorial](https://docs.google.com/document/d/1qFtj0sL0nvSMTMW-youA0BCI1rTfHbrPS1s51MULYs0/edit) (also linked in-app via the **📖 How it works** button) for the full prompt.

### The flow
1. **Extract** — Open DegreeWorks in your student portal, select all (Ctrl/Cmd+A), and copy the text.
2. **Process with AI** — Paste it into Gemini / Claude / ChatGPT / DeepSeek along with the tutorial prompt.
3. **Generate CSV** — The AI returns a single 12-column CSV.
4. **Import** — Drag-and-drop that CSV into the Zotler converter tab, review the rows, and save.

### The 12-column schema
`course_id, course_name, units, grade, term, status, source, transfer_origin, gpa_points, req_block, satisfies_req, exception_note`

Because the AI does the parsing and classification, the CSV already distinguishes:

- **Status** — `completed`, `in_progress`, or `planned` (derived from grade + term relative to the audit date), so current and future courses import correctly.
- **Source** — `uci`, `transfer`, or `ap`. Transfer rows keep the originating institution code (e.g. `SAC`, `GWC`, `UCR`) in `transfer_origin`; AP rows note the satisfying exam in `exception_note`.
- **Requirement context** — `req_block` (University Requirements / General Education / Major / Electives) and the specific `satisfies_req` sub-requirement header.

This replaces the old on-device PDF parser and the separate ASSIST transfer-lookup step — transfers and AP credits no longer need a manual second pass.

### On-device parsing
The importer parses the CSV entirely in the browser (RFC-4180 quoted-field handling for the comma-heavy requirement columns), maps columns by header name (order-tolerant), and saves the rows to `chrome.storage.local`. Nothing is uploaded.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Browser Extension | Manifest V3, cross-browser (Chrome **Side Panel API** + Firefox **Sidebar API**), `chrome.storage.local` |
| Course import | DegreeWorks → AI-generated 12-column CSV, parsed on-device |
| AI (demo) | **None live** — scripted keyword-matched responses with simulated latency ([`sidebar.js`](extension/sidebar.js)). The Gemini key field is a placeholder for a future live version |
| Website | Vanilla HTML/CSS/JS, PDF.js (CDN) — legacy onboarding flow |
| Scraper | Python 3, `requests`, `beautifulsoup4`, `pdfplumber`, `selenium`, `webdriver-manager` |
| Data | CSV (no database in prototype phase) |

---

## Project Status

This is a **scripted demo build** (Summer 2026). The chat assistant's answers are **hardcoded, pre-staged flows** — there is no LLM, no backend, and no network call from the chat. This is deliberate: the demo needs to be controllable and repeatable on stage for Iteration 2 feedback sessions, without the variability (or cost, or latency) of a live model. The DegreeWorks CSV import is real and parses on-device; all profile data stays in `chrome.storage.local`. Wiring the chat to a real LLM is future work (see Roadmap). The goal is a tangible, demoable artifact for feedback sessions when school resumes in Fall 2026.

See the [Requirements Document](https://www.notion.so/) for the full RE iteration log, open questions, and architecture decisions.

---

## Running Locally

**Chrome (recommended):**
1. Open `chrome://extensions` → enable **Developer mode**
2. Click **Load unpacked** → select the `extension/` folder
3. Click the Zotler icon to open the side panel, then ⚙ to open the **Settings tab**
4. (Optional) import your courses: generate the CSV from DegreeWorks using the in-app **📖 How it works** tutorial and drop it into the converter — your courses load on-device. **No API key is needed** — the chat is scripted. To see the demo, click a suggestion chip or ask about a **CS minor**, **next quarter**, or your **graduation timeline**

**Firefox:**
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…** → select `extension/manifest.json`
3. Click the Zotler toolbar icon to toggle the sidebar (Firefox loads `sidebar.html` via the Sidebar API). The rest of the flow is identical to Chrome.

> The same `manifest.json` works in both browsers: Chrome uses `background.service_worker` + `side_panel`, Firefox uses `background.scripts` + `sidebar_action`, and each ignores the other's keys. Firefox logs a harmless warning about the Chrome-only `sidePanel` permission.

**Companion Website (alternative):**
```bash
cd website
python3 -m http.server 8765
# Open http://localhost:8765
```

**Python Scraper:**
```bash
cd scraper
pip install -r requirements.txt
cp .env.example .env        # add UCI credentials
python3 uci_scraper.py --help
```

---

## TODO — CSV Import Hardening

Open design questions for making the import robust, not just happy-path:

- **Alternative & error flows for bad input** — What happens when the user uploads a non-CSV file, the wrong CSV, or a CSV that's missing/renaming columns? Today the importer only surfaces a basic "no `course_id` column" error. Think through: file-type rejection, malformed/partial rows, empty files, wrong schema, and how to guide the user back to the tutorial when their file doesn't match.
- **Verifying the CSV content is *correct*, not just well-formed** — A structurally valid CSV can still contain nonsense, because the data is generated by an AI from pasted text. How do we catch *absurd* values? Examples to detect:
  - A course placed in the wrong requirement block (e.g. `COMPSCI 122A` listed under a Biology requirement).
  - Grades, units, or terms that are impossible or out of range.
  - Course IDs that don't exist at UCI, or `gpa_points` that don't match `grade × units`.
  - Possible approaches: validate against the UCI Catalogue / known course list, sanity-check `gpa_points` arithmetic, flag rows whose `req_block`/`satisfies_req` don't plausibly match the course, and let the user review/correct flagged rows before saving.

---

## Roadmap (temp)

- [ ] Replace the scripted chat with real LLM calls (e.g. Gemini `gemini-2.0-flash`), grounded in the student's courses + UCI requirements (the Settings key field is wired for this)
- [x] Import transfer/AP credits in one pass via the DegreeWorks CSV flow (replaces the separate ASSIST converter step)
- [x] Capture in-progress and planned courses from the audit (status derived by the AI)
- [ ] Harden CSV import: alternative/error flows for non-CSV or wrong-format files (see TODO above)
- [ ] Validate CSV *content* for absurd/incorrect data (wrong req block, impossible grades/units, non-existent courses)
- [ ] Proxy LLM calls through a backend so the API key isn't shipped in the extension
- [ ] Pull live course data from WebSOC / UCI Catalogue
- [ ] Resolve open questions OQ-01 through OQ-05 via Fall 2026 surveys and interviews
