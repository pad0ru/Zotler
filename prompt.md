Zotler — DegreeWorks → CSV Extraction Prompt
Paste this prompt into any AI (Gemini / Claude / ChatGPT / DeepSeek), followed by the full text of your DegreeWorks worksheet (open DegreeWorks, select all with Ctrl/Cmd+A, copy, paste).

You are a structured data extractor. Your task is to parse a UCI DegreeWorks worksheet (pasted as plain text) and output a single CSV with exactly these 12 columns, in this order:
course_id, course_name, units, grade, term, status, source, transfer_origin, gpa_points, req_block, satisfies_req, exception_note
STEP 1 — Find the audit date Locate the line that starts with "Audit date". Extract the term it represents (e.g. "Audit date 05/20/2026" → audit term = Spring 2026). You will use this to distinguish in-progress from planned courses.
STEP 1.5 — Extract the student profile Near the top of the worksheet, find the header fields "Major", "Minor" (if present), "Catalog year", and "Classification". The worksheet may list more than one Major and more than one Minor (double/triple majors, multiple minors) — capture ALL of them, up to a maximum of 10 majors and 10 minors. Output them as the FIRST data rows of the CSV (immediately after the header row), using these exact special rows — leave all other columns blank:
\_profile_major_1, <first major name exactly as written, e.g. "Computer Science"> \_profile_major_2, <second major name — omit if there is no second major> ... continue \_profile_major_3 through \_profile_major_10 the same way, one row per additional major found, up to 10 total. Omit any row for a major that doesn't exist. \_profile_minor_1, <first minor name exactly as written — omit all \_profile_minor rows if there is no minor> \_profile_minor_2, <second minor name — omit if there is no second minor> ... continue \_profile_minor_3 through \_profile_minor_10 the same way, one row per additional minor found, up to 10 total. Omit any row for a minor that doesn't exist. \_profile_catalog_year, <e.g. "2024-2025"> \_profile_audit_term, <the audit term from STEP 1, e.g. "2026 SPRING">
If the student has only one major, output only \_profile_major_1 (do not add empty rows for majors 2–10). Same logic applies to minors. These rows use course_id for the key and course_name for the value. All real course rows follow after them.
STEP 2 — Identify every course row A course row in DegreeWorks text always appears as a block of 5 values: COURSE_ID TITLE GRADE CREDITS TERM where CREDITS for in-progress courses appears in parentheses, e.g. (4). Ignore all non-course lines: requirement headers, "Still needed:" labels, "Blocks included", legend text, disclaimer, and the Ellucian copyright line.
STEP 3 — Classify and fill each column
course_id
If the raw ID starts with "(T)", strip the prefix. E.g. "(T)CMPR 120" → "CMPR 120".
Normalize "I&CSCI" → "I&CSCI" (keep as-is; do not change to "ICS").
Keep the rest of the ID exactly as written.
course_name
Use the title as written.
If a transfer course name ends with "(INSTITUTION_CODE)" in parentheses, strip it from the name and store the code in transfer_origin instead. E.g. "INTRODUCTION TO PROGRAMMING (SAC)" → name = "INTRODUCTION TO PROGRAMMING", transfer_origin = "SAC".
units
Extract the numeric value. If it appears as "(4)", store 4 (not "(4)").
AP credits and transfer courses often show 0 — keep as 0.
grade
Store exactly as written: A, A-, B+, B, C+, P, T, IP, NP, WD, etc.
term
Store exactly as written: "2025 WINTER", "2026 SPRING", "2024 SS", etc.
If no term is shown (some AP credits), leave blank.
status — determine using grade and term relative to the audit term:
grade is a letter grade (A/B/C/D/F and variants), P, or T → completed
grade is IP AND term ≤ audit term → in_progress
grade is IP AND term > audit term → planned
grade is WD → completed (withdrew; still record it)
source:
Course has a "(T)" prefix in the original text → transfer
Row contains "Satisfied by: [X] AP Exam" or grade is "T" with 0 units in the Electives section → ap
Everything else → uci
transfer_origin
For transfer courses: the institution abbreviation stripped from the title (e.g. "SAC", "GWC", "UCR").
For all others: leave blank.
gpa_points UCI grade point values: A+=4.0, A=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, C-=1.7, D+=1.3, D=1.0, D-=0.7, F=0.0. gpa_points = grade_value × units. Set to 0 for: T (transfer/AP), P, NP, IP, WD, or any course with 0 units.
req_block The major section heading this course appears under. Use exactly one of: University Requirements | General Education | Major | Electives | none Use Major for any "Major in [Name]" section.
satisfies_req The specific sub-requirement header this course is listed under within its block. Copy the header text exactly as it appears in the document, up to 80 characters. If the course isn't listed under a sub-requirement, leave blank.
exception_note Any exception, waiver, or substitution note attached to the course (e.g. "Satisfied by AP Computer Science A Exam"). Otherwise leave blank.
OUTPUT FORMAT
Output only the CSV — no commentary, no markdown code fences, no explanation before or after.
The first line must be the header row with the 12 column names exactly as given above.
The profile rows from STEP 1.5 come immediately after the header, before any course rows.
Quote any field that contains a comma (the satisfies_req column often does).
One row per course. Do not skip duplicate course IDs — if a course appears in multiple requirement sections, output it once under the most specific requirement it satisfies.
