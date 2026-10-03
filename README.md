# Zotler — UCI AI Academic Planner

An AI-powered academic planning assistant for UCI students, built as a cross-browser (Chrome + Firefox) extension. Ask natural-language questions about your degree, explore major/minor options, and generate a graduation timeline — all from your browser, with your data staying on your device.

---

## What's Been Built (Local AI Alpha)

### Browser Extension (`extension/`)

A persistent sidebar panel (Manifest V3, runs in **Chrome and Firefox**) that opens alongside any webpage:

- **Chat UI** — conversation interface with typing indicator and quick-suggestion chips
- **Local AI chat (Gemma via LM Studio)** — the sidebar chat calls a model running on your own machine through LM Studio's OpenAI-compatible `POST /v1/chat/completions` endpoint (shared client in [`local-ai.js`](extension/local-ai.js)). Each request includes your profile, completed courses, requirements context, and session history. Only `localhost` / `127.0.0.1` over HTTP is allowed, so **no data leaves your device**. Replies are non-streaming with a 3-minute timeout to allow for model loading; history is cleared when the profile or model settings change. Setup and troubleshooting: [`LOCAL_TESTING.md`](LOCAL_TESTING.md). This is an alpha — end-to-end generation is still being verified on real hardware.
- **Full-page Settings tab** — clicking ⚙ opens a dedicated browser tab (roomier than the narrow side panel) to set declared major, minor, expected graduation, the local AI server URL and model name (with a **Test connection** button), and to import your courses. Saves to `chrome.storage.local`; the sidebar auto-refreshes the moment settings change.
- **DegreeWorks CSV import** — copy your DegreeWorks audit, paste it into any AI (Gemini/Claude/ChatGPT/DeepSeek) with the provided prompt to get a structured 12-column CSV, then drag-and-drop that CSV into either the converter tab **or** the Settings tab — both share one importer (`csv-import.js`). It's parsed on-device — no server, no upload. A **📖 How it works** button opens the step-by-step guide bundled with the extension (see below). Because the AI classifies everything up front, transfer credits, AP credits, and in-progress/planned courses all import in one pass.
- **AntAlmanac plan sync** — if the student is signed in to AntAlmanac in the same browser, their saved schedules sync automatically whenever the sidebar or Settings opens, and from any open antalmanac.com tab (`antalmanac-sync.js`, using AntAlmanac's internal `schedule.get` route with the student's existing login — no export step). Students without an account can still drop AntAlmanac's JSON export (Import/Export → Export, in its dev mode) into Settings → Courses. AntAlmanac only stores section codes, so each one is resolved to a course through the public [Anteater API](https://anteaterapi.com) (`antalmanac-import.js`). The active schedule's planned classes are added to the chat context, and **Download student_plan.sqlite** exports the plan via [sql.js](https://github.com/sql-js/sql.js) (vendored in `extension/vendor/`, refreshed with `npm run vendor`).
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

The converter no longer parses a PDF directly. Instead it ingests a CSV that you generate from your DegreeWorks audit with the help of any AI. The step-by-step guide is bundled with the extension (`instructions.html`, opened from Settings → Courses via **📖 How it works**) and rendered from two Markdown files you can edit directly: `extension/Instructions/Instructions.md` (user steps) and `extension/Instructions/Prompt.md` (the full extraction prompt, with a copy button). Refresh the guide after editing. The prompt asks the AI for a downloadable UTF-8 `degreeworks.csv`, falling back to raw CSV text if it can't create files.

### The flow
1. **Extract** — Open DegreeWorks in your student portal, select all (Ctrl/Cmd+A), and copy the text.
2. **Process with AI** — Paste it into Gemini / Claude / ChatGPT / DeepSeek along with the prompt from the guide.
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

## Planned Classes — `student_plan.sqlite`

The exported file is meant to sit next to the ICS catalog database, `uci_ics_2026_27.sqlite`. Its `planned_sections.course_code` uses the same format as the catalog's `courses.course_code` (e.g. `I&C SCI 45J`), so the two files join with `ATTACH`:

```sql
-- sqlite3 uci_ics_2026_27.sqlite
ATTACH 'student_plan.sqlite' AS plan;
SELECT p.term, p.course_code, c.title, v.prerequisite_text
FROM plan.v_planned_courses p
JOIN courses c USING(course_code)
LEFT JOIN v_major_course_prerequisites v
  ON v.course_code = p.course_code AND v.major = 'Computer Science'
WHERE p.is_active = 1;
```

Tables: `metadata`, `schedules` (one row per AntAlmanac schedule; `is_active` marks the one that was open in AntAlmanac), and `planned_sections` (term, section code, resolved course code, title, units, section type, instructors, meetings JSON). Section codes the API couldn't resolve are kept with `resolved = 0`. Run `npm test` for the importer's unit tests.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Browser Extension | Manifest V3, cross-browser (Chrome **Side Panel API** + Firefox **Sidebar API**), `chrome.storage.local` |
| Course import | DegreeWorks → AI-generated 12-column CSV, parsed on-device |
| Planned classes | AntAlmanac account sync (or JSON export) → Anteater API section lookup → `student_plan.sqlite` (sql.js / WASM) |
| Catalog data | `uci_ics_2026_27.sqlite` — ICS majors, courses, requirements and prerequisites, joined to the student's plan via `ATTACH` |
| AI (alpha) | **Local Gemma via LM Studio** (`/v1/chat/completions` on localhost), client in [`local-ai.js`](extension/local-ai.js). Gemini is no longer called by the chat |
| Website | Vanilla HTML/CSS/JS, PDF.js (CDN) — legacy onboarding flow |
| Scraper | Python 3, `requests`, `beautifulsoup4`, `pdfplumber`, `selenium`, `webdriver-manager` |
| Data | CSV (no database in prototype phase) |

---

## Project Status

This is a **local-AI alpha build** (Fall 2026). The chat talks to a model you run yourself through LM Studio (tested target: `google/gemma-4-12b-qat`); there is no hosted backend and no cloud API call. The DegreeWorks CSV import is real and parses on-device; all profile data stays in `chrome.storage.local`. Still being verified: a successful in-extension generation on real hardware (an early direct test timed out), plus the full DegreeWorks → CSV → import → chat workflow. The AntAlmanac sync reads AntAlmanac's internal `schedule.get` route, so it is unofficial and may break if AntAlmanac changes it; it has been unit-tested with mocked replies but not yet confirmed against a real signed-in account. The earlier scripted demo flows have been replaced. The goal is a tangible, demoable artifact for feedback sessions in Fall 2026.

See the [Requirements Document](https://www.notion.so/) for the full RE iteration log, open questions, and architecture decisions.

---

## Running Locally

**Chrome (recommended):**
1. Open `chrome://extensions` → enable **Developer mode**
2. Click **Load unpacked** → select the `extension/` folder
3. Click the Zotler icon to open the side panel, then ⚙ to open the **Settings tab**
4. Start LM Studio's local server with a Gemma model loaded (see [`LOCAL_TESTING.md`](LOCAL_TESTING.md)). In Settings → AI Assistant, enter `http://localhost:1234` (no `/v1`) and the exact model identifier, click **Test connection**, then **Save Settings**. If requests are blocked, enable CORS in LM Studio's server settings. No API key is needed
5. (Optional) import your courses: generate the CSV from DegreeWorks using the in-app **📖 How it works** guide and drop it into the converter — your courses load on-device. 6. (Optional) sign in at [antalmanac.com](https://antalmanac.com) in the same browser and save your schedule — your planned classes sync into the sidebar automatically (no export). Reload the extension first so it picks up the new antalmanac.com / Anteater API permissions. Run `npm test` for the importer tests
7. Ask the sidebar about a **CS minor**, **next quarter**, or your **graduation timeline**

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

- [x] Replace the scripted chat with a local LLM (Gemma via LM Studio), grounded in the student's courses + requirements
- [ ] Verify local generation end-to-end (diagnose the 12B model timeout), then consider streaming, elapsed-time feedback, and cancellation
- [ ] Add reproducible tests for the local AI client and CSV import (`npm test` is currently a placeholder)
- [ ] Work through the backlog in `FIX_NEXT_TIME.md`
- [x] Sync planned classes from AntAlmanac automatically and export them as `student_plan.sqlite`
- [ ] Confirm the AntAlmanac sync against a real signed-in account (cookie handling in the sidebar vs. an open antalmanac.com tab)
- [ ] Track `uci_ics_2026_27.sqlite` alongside the extension and document how it is built
- [x] Import transfer/AP credits in one pass via the DegreeWorks CSV flow (replaces the separate ASSIST converter step)
- [x] Capture in-progress and planned courses from the audit (status derived by the AI)
- [ ] Harden CSV import: alternative/error flows for non-CSV or wrong-format files (see TODO above)
- [ ] Validate CSV *content* for absurd/incorrect data (wrong req block, impossible grades/units, non-existent courses)
- [ ] If a hosted LLM is ever added, proxy calls through a backend so no API key ships in the extension
- [ ] Pull live course data from WebSOC / UCI Catalogue
- [ ] Resolve open questions OQ-01 through OQ-05 via Fall 2026 surveys and interviews
- [ ] Reduce AI hallucination in chat responses
- [ ] Ask ICSSC (for guidance/collaboration — TBD scope)
- [ ] Use SQLite for local data storage
- [ ] Email UCI OIT for ZotGPT access
- [ ] Record demo
- [ ] assist.org API — determine if we need it or not
