# Fix Next Time

Open issues from the code reviews (2026-08-18), ranked most severe first. None are fixed yet.
Items 1–9 are from the first review; items 10–14 were added by the second review the same day.

---

## 1. `prompt.md` — escaped `_profile_` keys break the importer ⚠️ most urgent

**Where:** `prompt.md` STEP 1.5

The special-row keys are written with leftover markdown escapes (`\_profile_major_1` instead of `_profile_major_1`). An AI following the prompt "exactly" will emit `\_profile_major_1,Computer Science`, which fails the importer's `id.startsWith("_profile_")` check in `extension/csv-import.js` — so major/minor never auto-fill, and each row imports as a phantom completed 0-unit "course" that gets injected into the Gemini system prompt.

Also: `prompt.md` is still **untracked in git** while README links to it as the canonical spec — commit it.

**Fix:** remove the backslashes in prompt.md; commit the file.

---

## 2. Settings Save clobbers a newer import from another tab

**Where:** `extension/settings.js` (boot + save handler)

The Settings tab reads the profile once at boot and has no `chrome.storage.onChanged` listener. Clicking **Save Settings** writes that stale in-memory snapshot (including the whole `courses` array) back to storage.

**Failure:** open Settings → import CSV in the converter tab → come back to Settings to paste the Gemini key → Save → the entire import is wiped.

**Fix:** add an `onChanged` listener that merges storage changes into the in-memory profile (like sidebar.js does), or re-read the stored profile inside the Save handler before writing.

---

## 3. XSS: `profile.major` / `profile.minor` injected into `innerHTML` unescaped

**Where:** `extension/settings.js` → `showProfileSummary()`

The old `<select>` dropdowns were the implicit sanitizer; major/minor now come from an untrusted AI-generated CSV and free-text fields, and are interpolated into `innerHTML`. A CSV row like `_profile_major_1,"<img src=//attacker/x>"` injects markup on import and on every future Settings load (MV3 CSP blocks inline script but not `img` beacons).

**Fix:** reuse `converter.js`'s `esc()` helper (move it into a shared file) or build the summary with `textContent`.

---

## 4. Re-import can never clear a dropped minor

**Where:** `extension/csv-import.js` (`profileMeta` assembly) + consumers in `settings.js` / `converter.js`

`profileMeta.minor` is only set when minor rows were found, so the consumers' clearing branch `if ("minor" in profileMeta) profile.minor = profileMeta.minor || null` is dead code. A student who drops their minor and re-imports a fresh audit (which omits all `_profile_minor` rows per the prompt) keeps the stale minor forever — and Gemini keeps planning around it. Same applies to `catalog_year` / `audit_term`.

**Fix:** in `csv-import.js`, set `profileMeta.minor = minors.join(" / ") || null` unconditionally (or whenever any `_profile_` rows were seen).

---

## 5. Thrown fetch leaves a dangling user turn in chat history

**Where:** `extension/sidebar.js` → `callGemini()` retry loop

`conversationHistory.pop()` only runs on the `!res.ok` path. If `fetch()` *rejects* (offline, DNS failure) anywhere in the 4-attempt retry loop — whose ~10.5s of backoff widens the window — the just-pushed user turn stays in history. The next request then sends two consecutive user turns, which Gemini may reject as invalid role alternation or answer the stale question.

**Fix:** wrap the request in `try/finally` (or catch-and-pop) so the history is cleaned on thrown errors too.

---

## 6. "No response received." gets saved as a real model turn

**Where:** `extension/sidebar.js` → `callGemini()` response handling

When the response contains no non-thought text parts (realistic on a thinking model when reasoning exhausts `maxOutputTokens` — finishReason `MAX_TOKENS`), the fallback string is pushed into `conversationHistory` as a genuine model turn, corrupting multi-turn context on retry.

**Fix:** on empty output, pop the user turn and surface it as an error instead of pushing the fallback.

---

## 7. `test_transcript.mjs` tests deleted code; the real importer has zero coverage

**Where:** `test_transcript.mjs`, `package.json`

The test mirrors `extractLines` / `parseCourseTokens` — functions that no longer exist in `converter.js` (the PDF pipeline was replaced by the CSV flow). It depends on the local/gitignored `User files /Unofficial Transcript.pdf`, so it is not reproducible on a clean clone. In the current workspace it passes (26 courses, 107 units), but `npm test` still exits 1 unconditionally ("no test specified"), and `pdfjs-dist` is shipped solely for this dead test.

**Fix:** replace with a test of `ZotlerCSV.parse` over a checked-in sample CSV (cover the `_profile_` rows: numbered, legacy un-numbered, multi-major, no-minor), wire it into `npm test`, drop `pdfjs-dist`.

---

## 8. Error messages rendered via `innerHTML` unescaped

**Where:** `extension/sidebar.js` → `sendMessage()` catch block (error bubble)

`err.message` is interpolated into `innerHTML`, and the retry logic's `[${msg}]` suffix pipes the Gemini server's error text straight into that sink. A 400 that echoes request content with angle brackets gets parsed as HTML — mangled at best, injected markup at worst.

**Fix:** render the message with `textContent` inside a styled element.

---

## 9. Old minor slugs display verbatim after the dropdown removal

**Where:** `extension/settings.js`

The old minor `<select>` stored raw slugs (`stats`, `cs-minor`, `ds-minor`, `math`) as `profile.minor`, and unlike majors there was never a label mapping. Anyone who saved under the old UI now sees literal `stats` in the free-text field and summary, and `buildSystemPrompt` sends "Minor: stats"; one Save persists the slug as canonical.

**Fix:** one-time migration map slug → label on load (low priority — no users yet, so clearing stored data also works).

---

## 10. Free-text major vs. hardcoded CS-only requirements block

**Where:** `extension/sidebar.js` → `REQUIREMENTS` + `buildSystemPrompt()`

Major is now free text auto-filled from the CSV, but `REQUIREMENTS` is still a hardcoded CS-B.S.-only block — and the new "say you don't know if not supported by the requirements listed above" rule keys off exactly that mismatch. `prompt.md`'s own example emits "Computer Science" (no "B.S.") or "Computer Science / Mathematics", neither of which matches "CS B.S." — so the honesty rule can turn a supported student's question into a refusal. Worse, any non-ICS major (the removed dropdown was the only bound) imports fine and gets answers grounded in the *wrong degree's* checklist.

**Fix:** short-term, tell the model in the prompt that the requirement set covers only the ICS CS B.S. (+ listed minors) and to say so for other majors. Long-term: per-major requirement data (already on the roadmap).

---

## 11. CSV without `_profile_` rows imports with major forever empty, silently

**Where:** `extension/converter.js` → `saveProfile()` (and converter.html)

The old "Computer Science B.S." default was removed, converter.html has no major field, and there's no fallback signal — a CSV without `_profile_` rows (e.g. generated from the older tutorial-doc prompt, which predates STEP 1.5) imports with major `""` and zero user-visible warning. The sidebar then tells Gemini "Major: not set — ask the student to import their DegreeWorks audit" on every turn, looping the student on an import they just did.

**Fix:** when no `_profile_major` rows are found, show a warning in the done/import status ("No major found in CSV — set it in ⚙ Settings") and link to Settings.

---

## 12. Unrecognized `_profile_` rows vanish silently

**Where:** `extension/csv-import.js` (the `_profile_` prefix filter)

Any row starting with `_profile_` is dropped from the course list, but unrecognized keys are discarded with no warning channel — including `_profile_classification`, which prompt.md STEP 1.5 mentions but `PROFILE_SCALAR_KEYS` never maps. If the AI emits a typo'd key (`_profile_majors_1`), import reports success while the major stays empty, and the evidence is gone — undebuggable from the UI.

**Fix:** collect unknown `_profile_` keys into a `warnings` field on the parse result and surface "ignored N unrecognized profile rows" in both importers; decide whether classification should be captured or removed from the prompt.

---

## 13. No in-flight guard on chat send

**Where:** `extension/sidebar.js` → `sendMessage()` / retry loop

The send button and Enter key are never disabled while a request is in flight, and the retry loop can silently run ~10.5s. A second send during that window starts a concurrent `callGemini` mutating the shared `conversationHistory` — interleaved role sequences the API rejects, plus doubled token spend. The retry ladder also ignores `Retry-After`, retries hard-quota 429s, and has no `AbortController`.

**Fix:** set an `isSending` flag that disables send until the current call settles; respect `Retry-After` when present.

---

## 14. Smaller cleanups noted by the review (cut from its cap)

- `conversationHistory` is unbounded and resent in full on every request *and every retry* — quadratic token cost over a long session; trim to the last N turns.
- The 4-line `profileMeta` → profile merge is duplicated byte-identically in `converter.js` and `settings.js` — move into `csv-import.js` as `applyProfileMeta(profile, meta)`.
- `storageGet`/`storageSet` are triplicated; `converter.js`'s copy lacks the non-extension `localStorage` fallback the other two have.
- `parse()`'s error paths return `profileMeta: {}` without the `majors`/`minors` arrays the success path includes (shape inconsistency); the arrays themselves are never consumed.
- The disclaimer now exists in three places with two wordings, and error-path replies get none.
- `package.json` is unedited npm-init boilerplate (`npm test` always exits 1) whose only dependency, `pdfjs-dist`, serves the dead test from item 7.

---

## 15. Settings cannot clear an existing Gemini API key

**Where:** `extension/settings.js` → Save handler

The handler only calls `storageSet("geminiKey", apiKey)` when the field is non-empty. Clearing the field and saving leaves the old key in `chrome.storage.local`, so the no-key chat path cannot be reached through the UI.

**Fix:** explicitly remove the key or store an empty value when the field is blank; add a save/reload test for both setting and clearing the key.

---

## 16. Companion website exports do not round-trip into the extension

**Where:** `website/app.js` → `exportCSV()` / `exportJSON()`

The website CSV exports 9 columns (`quarter`, `year`, and `satisfies_req_id`) rather than the extension's 12-column schema, and it emits no `_profile_*` metadata rows. The JSON export also uses the website's different course shape and is not consumed by the extension.

**Fix:** either make the website export the documented 12-column Zotler CSV with profile metadata, or add an explicit conversion/import path and document that the JSON export is not extension-compatible. Add a fixture-based round-trip test.

---

## 17. CSV parser accepts malformed rows without validation

**Where:** `extension/csv-import.js` → `parseCSV()` / `parse()`

Unescaped commas can shift fields between columns, and unterminated quotes are accepted without an error. Invalid `units` and `gpa_points` silently become zero. The importer also accepts implausible requirement mappings and GPA values.

**Fix:** detect unterminated quotes and unexpected row widths, surface row-specific warnings/errors, and decide whether numeric/content validation belongs in the importer or only in a separate audit-quality checker.
