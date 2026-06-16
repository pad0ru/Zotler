# Zotler — UCI AI Academic Planner

An AI-powered academic planning assistant for UCI students, built as a Chrome Extension. Ask natural-language questions about your degree, explore major/minor options, and generate a graduation timeline — all from your browser, with your data staying on your device.

---

## What's Been Built (Prototype v0.2)

### Chrome Extension (`extension/`)

A persistent sidebar panel (Manifest V3) that opens alongside any webpage:

- **Chat UI** — conversation interface with typing indicator and quick-suggestion chips
- **Gemini-powered answers** — questions are sent to Google's Gemini (`gemini-2.0-flash`) with the student's parsed courses **and** the UCI degree-requirement set injected into the system prompt, so responses (minor eligibility, graduation timeline, next-quarter planning, prereq chains, GPA, major exploration) are grounded in the actual transcript. Multi-turn context is preserved across the conversation. Bring your own free Gemini API key.
- **Full-page Settings tab** — clicking ⚙ opens a dedicated browser tab (roomier than the narrow side panel) to set declared major, minor, expected graduation, the Gemini API key, and to import your transcript. Saves to `chrome.storage.local`; the sidebar auto-refreshes the moment settings change.
- **Direct transcript import** — drag-and-drop (or choose) your UCI unofficial transcript PDF in Settings and it's parsed on-device with PDF.js (locally bundled) — no intermediate CSV step, no server, no upload.
- **Course-ID normalization** — the transcript's `I & C SCI 31` form is normalized to `ICS 31` so degree/minor matching works regardless of how courses are labeled.
- **ASSIST transfer-credit mapping** — a companion converter tab looks up community-college → UCI course equivalencies via the public [ASSIST](https://assist.org) API so transfer credits count toward requirements.
- **`chrome.storage.local`** — all profile data stored locally; no server required

### Companion Website (`website/`)

An alternative 3-step onboarding flow (run locally via `python3 -m http.server 8765`):

1. **Import Transcript** — same PDF upload and parsing as the extension converter
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

## Transcript Parsing — What Gets Detected and What Doesn't

The PDF parser reconstructs lines from PDF.js positioned text items (grouped by Y coordinate), then works backwards through each token to extract: `TITLE | DEPT | COURSE NUM | UNITS | GRADE | GRADE POINTS`. The `I & C SCI` four-token department code for ICS courses is handled as a special case.

### ✅ Parsed automatically
- All UCI quarter courses (e.g. `CALCULUS I MATH 2A 4.0 B 12.0`)
- Quarter and year headers (`2023 Fall Quarter`)

### ⚠️ Community College (CC) / Transfer Credits
The UCI unofficial transcript does **not** list individual CC courses — it only shows a summary block like:

```
GOLDEN WEST COL (Units 4.5) 1 Terms to 08/22
Units Transferred 36.5
```

Individual transfer course titles, grades, and UCI course equivalencies are **not** included. The parser skips these blocks. To account for CC credits in Zotler:

1. Check your **Transfer Credit Report** on StudentAccess — it lists each CC course and its UCI equivalent
2. Manually add the UCI equivalent courses (e.g. `MATH 2A` if your CC Calculus articulated) in the Review step of the converter, marking them as `completed`
3. Units-only transfers with no UCI equivalent (like elective credit) can be added as a generic entry for accurate unit counts

### ⚠️ AP Credits
AP exams appear on the transcript as exam-level summaries (e.g. `AP STATISTICS (Score 3, Units 4.0) 05/23`) without listing the UCI course they satisfy. The parser skips these. Add the equivalent UCI course manually — for example, a score of 3 on AP Statistics typically grants credit for STATS 67.

### ⚠️ Courses currently in progress
The UCI unofficial transcript does not include the current quarter's enrollment. Add in-progress courses manually in the converter's review table and set their status to `In Progress`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Chrome Extension | Manifest V3, Side Panel API, `chrome.storage.local`, PDF.js (bundled) |
| AI | Google Gemini (`gemini-2.0-flash`) via the Generative Language REST API, called directly from the extension with a user-supplied key |
| Transfer credits | Public ASSIST articulation API (`prod.assistng.org`) |
| Website | Vanilla HTML/CSS/JS, PDF.js (CDN) |
| Scraper | Python 3, `requests`, `beautifulsoup4`, `pdfplumber`, `selenium`, `webdriver-manager` |
| Data | CSV (no database in prototype phase) |

---

## Project Status

This is a **working prototype** (Summer 2026). AI responses now come from real Gemini calls grounded in the student's transcript and the UCI requirement set — the earlier hardcoded mock-reply engine has been replaced. There's still no backend: the extension talks to Gemini directly with a user-supplied key, and all profile data stays in `chrome.storage.local`. The goal is to have a tangible artifact for Iteration 2 feedback sessions when school resumes in Fall 2026.

See the [Requirements Document](https://www.notion.so/) for the full RE iteration log, open questions, and architecture decisions.

---

## Running Locally

**Chrome Extension (recommended):**
1. Open `chrome://extensions` → enable **Developer mode**
2. Click **Load unpacked** → select the `extension/` folder
3. Click the Zotler icon to open the sidebar, then ⚙ to open the **Settings tab**
4. Paste a free Gemini API key (from [aistudio.google.com](https://aistudio.google.com)) and upload your UCI unofficial transcript PDF — your courses load automatically and the chat is ready

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

## Roadmap

- [x] Replace mock responses with real LLM calls (Gemini `gemini-2.0-flash`)
- [ ] Parse the transcript's transfer/AP sections so CC and AP credits import without the separate ASSIST converter step
- [ ] Map AP exam scores to UCI course equivalents automatically
- [ ] Proxy LLM calls through a backend so the API key isn't shipped in the extension
- [ ] Pull live course data from WebSOC / UCI Catalogue
- [ ] Supabase backend for cross-device sync (opt-in, per NFR-05)
- [ ] Resolve open questions OQ-01 through OQ-05 via Fall 2026 surveys and interviews
