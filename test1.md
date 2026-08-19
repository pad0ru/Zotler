# Codex Test Prompt — Zotler Extension: CSV Import & AI Chat

Paste everything below the line into Codex.

---

You are testing **Zotler**, a Manifest V3 browser extension (Chrome + Firefox) that acts as an AI academic planner for UCI students. Load the unpacked extension from the `extension/` folder (`chrome://extensions` → Developer mode → Load unpacked). There is no backend: profile/course data lives in `chrome.storage.local`, and chat answers come from a live call to the Gemini API (`gemini-3.6-flash`) using a user-supplied API key, from `extension/sidebar.js`.

Key files to read before testing:
- `extension/csv-import.js` — shared CSV parser (`ZotlerCSV.parse`), used by both `converter.js` and `settings.js`
- `extension/sidebar.js` — chat UI + `callGemini()` + `buildSystemPrompt()`
- `extension/settings.js` — Settings tab (profile fields, API key, CSV import)
- `extension/converter.js` — Converter tab (also does CSV import)
- `prompt.md` — the exact prompt users paste into an external AI to turn a DegreeWorks audit into the 12-column CSV Zotler imports

Your job: **exercise the app like a real user would, across both the happy path and adversarial/edge-case inputs, and produce a written report of what actually happened vs. what should happen.** Don't just read the code — click through the UI, import real CSVs, and chat with the AI. Use a real (free) Gemini API key from aistudio.google.com if available; if not, note which chat tests you couldn't run live and why.

## How to report results

For each test case below, record:
1. **Steps taken**
2. **Expected result**
3. **Actual result**
4. **Pass / Fail / Can't-test**

Group findings by section. At the end, list anything you found that isn't covered by a listed test case.

---

## Section A — CSV Import (Converter tab and Settings tab)

The importer expects a 12-column CSV: `course_id, course_name, units, grade, term, status, source, transfer_origin, gpa_points, req_block, satisfies_req, exception_note`, with optional `_profile_*` metadata rows before the course rows (see `prompt.md` STEP 1.5 for the exact schema).

1. **Happy path** — Build a small valid CSV with a header row, 2–3 `_profile_major_N` / `_profile_minor_N` rows, `_profile_catalog_year`, `_profile_audit_term`, and 5–10 course rows covering `status` = completed/in_progress/planned and `source` = uci/transfer/ap. Drag-and-drop it into the Converter tab. Confirm courses and profile (major/minor/catalog year) populate correctly and persist after reloading the extension.
2. **Non-CSV file** — Drop a `.pdf` or `.png` file into the importer. Does it reject gracefully or throw/hang?
3. **Empty file** — Drop a 0-byte file.
4. **Header-only CSV** — Header row, no data rows.
5. **Missing `course_id` column** — Valid-looking CSV but the header is missing/misspells `course_id`. Confirm the "Couldn't find a course_id column" error appears.
6. **Wrong column order** — Same 12 columns but shuffled order (importer claims to be order-tolerant — verify).
7. **Legacy un-numbered profile rows** — Use `_profile_major` / `_profile_minor` instead of `_profile_major_1` / `_profile_minor_1`. Confirm these are still accepted.
8. **Escaped underscore keys (regression check)** — Build a CSV where the profile keys are written as `\_profile_major_1` (literal backslash before the underscore, matching what `prompt.md` currently instructs an AI to output — see STEP 1.5, and `FIX_NEXT_TIME.md` item 1). Confirm what actually happens: does `\_profile_major_1` get treated as a real course row (a phantom completed 0-unit course with course_id `\_profile_major_1`), and does the major field stay empty?
9. **Multiple majors/minors, up to 10** — CSV with 3 majors and 2 minors. Confirm all are captured and joined with " / " in the stored profile.
10. **Dropped minor on re-import** — Import a CSV with a minor, confirm it's stored, then import a second CSV (fresh audit) that has zero `_profile_minor_*` rows. Does the old minor persist (bug) or clear (correct)?
11. **No `_profile_` rows at all** — A CSV that's just the 12 course columns with no metadata rows. Confirm the resulting behavior: is there any visible warning that major/minor were not found, or does it silently save with major `""`?
12. **Unrecognized `_profile_` key** — Add a row with a typo'd key, e.g. `_profile_majors_1,Computer Science`. Confirm it's silently dropped with no error/warning shown anywhere.
13. **Duplicate course IDs** — Same `course_id` appearing twice with different `req_block`/`satisfies_req`. Confirm both rows import (the importer doesn't dedupe).
14. **Malformed quoting** — A `satisfies_req` value containing an unescaped comma outside quotes, and one with a properly escaped internal quote (`""`). Confirm the RFC-4180 parser handles the quoted case and see what happens to the malformed one.
15. **Bad numeric fields** — `units` or `gpa_points` set to non-numeric text (e.g. "four"). Confirm it silently coerces to `0` via `parseFloat(...) || 0` rather than erroring.
16. **Content-plausibility (no validation expected — confirm the gap)** — Import a CSV where a course like `COMPSCI 122A` is listed under `req_block` = "General Education" instead of "Major", or `gpa_points` doesn't match `grade × units`. Confirm the importer accepts this without any sanity check (this is a known open gap, not a bug — just confirm current behavior for the record).
17. **XSS via profile field** — Set `_profile_major_1` to a value like `<img src=x onerror=alert(1)>`. Import via the Settings tab specifically (not just the converter) and check whether `showProfileSummary()` renders it as literal text or executes/injects it (`extension/settings.js` uses `innerHTML` for this — see `FIX_NEXT_TIME.md` item 3). Try both the Settings tab and the sidebar chat's system-prompt-derived rendering.

## Section B — Settings tab persistence & cross-tab behavior

18. **Cross-tab clobber** — Open the Settings tab, leave it open. In a separate action (converter tab or re-opening Settings fresh), import a new CSV with different courses. Go back to the *original, still-open* Settings tab (which has stale in-memory state) and click **Save Settings** (e.g. just to change the Gemini API key or grad date). Check whether the freshly imported courses/profile get overwritten with the stale snapshot.
19. **Settings ↔ Sidebar sync** — With the sidebar open, change and save something in Settings (major, grad date, API key). Confirm the sidebar picks up the change immediately without a manual reload (it should, via `chrome.storage.onChanged`).
20. **Old minor slug display** — If reachable, seed `chrome.storage.local` profile.minor with an old raw slug like `stats` or `cs-minor` (simulating a pre-migration user) and open Settings. Confirm whether it displays the raw slug verbatim instead of a readable label.
21. **API key storage** — Confirm the Gemini API key round-trips through Settings save/reload, and check (via DevTools → Application → Storage) that it's stored in plain text in `chrome.storage.local` (expected given "bring your own key," just document it).

## Section C — AI Chat (sidebar.js / callGemini)

Run these with a real Gemini API key where possible.

22. **Basic grounded Q&A** — After importing a real course set, ask: "What do I still need for the CS minor?" and "When am I on track to graduate?" Confirm the answer reflects the imported courses and the hardcoded `REQUIREMENTS` block in `sidebar.js`, and that the disclaimer footer is appended exactly once.
23. **`debug courses` command** — Type literally `debug courses` in the chat. Confirm it returns the raw normalized completed-course-ID list instead of calling Gemini.
24. **No API key set** — Clear the stored Gemini key, ask a question. Confirm the "Add your Gemini API key in ⚙ Settings" message appears without attempting a network call.
25. **Multi-turn context** — Ask a follow-up question that depends on the previous answer (e.g. "and what about after that?"). Confirm `conversationHistory` preserves context correctly across turns.
26. **Non-ICS / free-text major mismatch** — Set major (via CSV or Settings free-text field) to something outside Computer Science, e.g. "Biological Sciences", then ask a degree-progress question. Confirm whether Gemini refuses/hedges appropriately, invents unsupported requirements, or gives a wrong-degree answer grounded in the hardcoded CS-only `REQUIREMENTS` block (`FIX_NEXT_TIME.md` item 10).
27. **Rapid double-send** — Send a message, and immediately (before the typing indicator resolves) send a second message. Confirm whether the send button/Enter key is disabled during the in-flight request, or whether two concurrent `callGemini` calls corrupt `conversationHistory` (check for an alternating-role API error or a garbled/duplicated reply).
28. **Network failure mid-request** — Disconnect network (or use DevTools "Offline") right after sending a message so `fetch()` rejects rather than returning a non-2xx. Reconnect and send another message. Confirm whether the earlier user turn is still stuck in `conversationHistory` causing two consecutive "user" turns on the next request.
29. **Forced empty-response condition** — If feasible, provoke a response with no visible text parts (e.g. a very long/ambiguous prompt that could exhaust `maxOutputTokens` on thinking). Confirm whether "No response received." gets pushed into `conversationHistory` as a fake model turn and pollutes later turns, versus being surfaced only as a UI error.
30. **429/503 handling** — If you can trigger a rate limit (e.g. rapid-fire many requests on a free-tier key), confirm the retry/backoff behavior described in code (4 attempts, ~1.5s·2^n backoff) and that the final error message is user-readable.
31. **XSS via chat error path** — Craft or simulate a Gemini error response whose `error.message` contains HTML (e.g. `<img src=x onerror=alert(1)>` — you may need to intercept the fetch via DevTools overrides to fake this). Confirm whether `sendMessage()`'s catch block renders it unescaped via `innerHTML` (`FIX_NEXT_TIME.md` item 8).
32. **Long conversation token growth** — Send ~15+ back-and-forth turns. Confirm whether the full unbounded history is resent every time (check request payload size in DevTools Network tab growing linearly), since there's no trimming.

## Section D — Companion website (secondary, lower priority)

33. From `website/`, run `python3 -m http.server 8765`, and walk the 3-step onboarding flow (Import Transcript PDF → Review Courses → Export Profile). Confirm exports (`user_courses.csv`, `zotler_profile.json`) are well-formed and could round-trip into the extension.

## Section E — Test suite / tooling sanity

34. Run `npm test` and confirm what actually happens (expect it to currently fail/no-op — `package.json`'s test script is npm-init boilerplate).
35. Run `node test_transcript.mjs` directly and confirm whether it errors out due to referencing deleted PDF-parsing functions and/or a missing gitignored PDF fixture file.

---

## Deliverable

Produce a results table or checklist (pass/fail/can't-test) for all 35 cases above, plus a short "additional findings" section for anything unexpected you hit while poking around that isn't covered here. Do not fix any code — this is a test/report pass only.
