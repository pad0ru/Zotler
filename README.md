# Zotler — UCI AI Academic Planner

An AI-powered academic planning assistant for UCI students, built as a Chrome Extension with a companion website. Ask natural-language questions about your degree, explore major/minor options, and generate a graduation timeline — all from your browser.

---

## What's Been Built (Prototype v0.2)

### Companion Website (`website/`)

A 3-step onboarding flow hosted locally:

1. **Import Transcript** — upload your UCI unofficial transcript PDF or drag-and-drop it. Parsing runs entirely in-browser via PDF.js; nothing leaves your device.
2. **Review Courses** — editable table of all parsed courses with grade pills, status badges, and remove buttons. Manual course entry form as a fallback.
3. **Export Profile** — download a `user_courses.csv` or `zotler_profile.json` to import into the extension.

The PDF parser reconstructs lines from PDF.js positioned text items (grouped by Y coordinate), then works backwards through each line's token list to extract: `TITLE | DEPT CODE | COURSE NUM | UNITS | GRADE | GRADE POINTS`. Handles the `I & C SCI` multi-token department code for ICS courses.

### Chrome Extension (`extension/`)

A persistent sidebar panel (Manifest V3) that opens alongside any webpage:

- **Chat UI** — conversation interface with typing indicator and quick-suggestion chips
- **Settings panel** — set declared major, minor, expected graduation; import `user_courses.csv`
- **Mock AI responses** — prototype-quality rule-based responses for:
  - CS Minor / Data Science Minor eligibility (prereq-aware, based on imported courses)
  - Graduation timeline estimate
  - Next-quarter course recommendations (checks completed prereqs)
  - Prerequisite chains (ICS 31 → 46 → 161 → 171, etc.)
  - GPA calculation from imported transcript
  - Major exploration (CS vs. Informatics comparison)
- **`chrome.storage.local`** — all profile data stored locally; no server required

### Data (`data/`)

Two CSV files that serve as the prototype's data layer:

| File | Contents |
|---|---|
| `user_courses.csv` | Student's completed/in-progress/planned courses with grade, quarter, year, units, GPA points, and requirement mapping |
| `degree_requirements.csv` | Full UCI ICS CS B.S. requirement set — lower division, upper division core, electives — plus CS Minor and Data Science Minor rows, each with prerequisites, requirement group, and alternates |

### Python Scraper (`scraper/`)

`uci_scraper.py` — a CLI tool to automate data collection from real UCI sources:

- **Transcript PDF parser** (`--transcript`) — `pdfplumber`-based extraction matching the unofficial transcript layout
- **WebSOC scraper** (`--schedule`) — queries `websoc.reg.uci.edu` for the current quarter's open sections by department
- **UCI Catalogue scraper** (`--catalogue`) — `beautifulsoup4` scrape of `catalogue.uci.edu` for course descriptions and prerequisites; includes recursive prereq-chain builder
- **DegreeWorks scraper** (`--degreeworks`) — Selenium + headless Chrome, handles UCI SSO login and Duo 2FA, extracts completed/remaining requirements from the degree audit page

---

## Tech Stack

| Layer | Technology |
|---|---|
| Chrome Extension | Manifest V3, Side Panel API, `chrome.storage.local` |
| Website | Vanilla HTML/CSS/JS, PDF.js (client-side PDF parsing) |
| Scraper | Python 3, `requests`, `beautifulsoup4`, `pdfplumber`, `selenium`, `webdriver-manager` |
| Data | CSV (no database in prototype phase) |

---

## Project Status

This is a **static prototype** (Summer 2026). All AI responses are hardcoded mock replies — no backend, no real LLM calls. The goal is to have a tangible artifact for Iteration 2 feedback sessions when school resumes in Fall 2026.

See the [Requirements Document](https://www.notion.so/) for the full RE iteration log, open questions, and architecture decisions.

---

## Running Locally

**Website:**
```bash
cd website
python3 -m http.server 8765
# Open http://localhost:8765
```

**Chrome Extension:**
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder
4. Click the Zotler icon in the toolbar to open the sidebar

**Python Scraper:**
```bash
cd scraper
pip install -r requirements.txt
cp .env.example .env        # add UCI credentials
python3 uci_scraper.py --help
```

---

## Roadmap

- [ ] Replace mock responses with real Claude API calls
- [ ] Pull live course data from WebSOC / UCI Catalogue
- [ ] Supabase backend for cross-device sync (opt-in, per NFR-05)
- [ ] Resolve open questions OQ-01 through OQ-05 via Fall 2026 surveys and interviews
