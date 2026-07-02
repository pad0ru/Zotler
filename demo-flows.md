# Zotler Demo Flows — Scripted 3-Flow Demo (ICS Only)

All course data below was verified against `catalogue.uci.edu` on 2026-07-02.
Scope: Donald Bren School of ICS (I&C SCI, IN4MATX, COMPSCI). MATH 2A/2B are
included only as verified prerequisites, per the demo brief.

---

## 📚 Catalogue Research (verified 2026-07-02)

| Course | Title | Units | Prerequisite (verbatim from catalogue) |
|---|---|---|---|
| I&C SCI 6B | Boolean Logic and Discrete Structures | 4 | High school mathematics through trigonometry. |
| I&C SCI 6D | Discrete Mathematics for Computer Science | 4 | Recommended: I&C SCI 6B |
| I&C SCI 31 | Introduction to Programming | 4 | (none) |
| I&C SCI 32 | Programming with Software Libraries | 4 | I&C SCI 31 with a minimum grade of C |
| I&C SCI 33 | Intermediate Programming | 4 | I&C SCI 32 with a minimum grade of C or I&C SCI H32 with a minimum grade of C |
| I&C SCI 45C | Programming in C/C++ as a Second Language | 4 | I&C SCI 33 with a minimum grade of C or EECS 40 with a minimum grade of C |
| I&C SCI 45J | Programming in Java as a Second Language | 4 | I&C SCI 33 with a minimum grade of C or CSE 43 with a minimum grade of C |
| I&C SCI 46 | Data Structure Implementation and Analysis | 4 | I&C SCI 33 with a minimum grade of C and I&C SCI 45C with a minimum grade of C |
| I&C SCI 51 | Introductory Computer Organization | 6 | I&C SCI 33 and I&C SCI 6B |
| I&C SCI 139W | Critical Writing on Information Technology | 4 | Satisfactory completion of the Lower-Division Writing requirement. |
| IN4MATX 101 | Concepts in Programming Languages | 4 | (I&C SCI 51 with a minimum grade of C or EECS 31 with a minimum grade of C) and I&C SCI 46 with a minimum grade of C |
| IN4MATX 113 | Requirements Analysis and Engineering | 4 | I&C SCI 33 with a minimum grade of C and IN4MATX 43 with a minimum grade of C |
| COMPSCI 161 | Design and Analysis of Algorithms | 4 | I&C SCI 46 with a minimum grade of C and I&C SCI 6B and I&C SCI 6D and (MATH 2B or AP Calculus BC with a minimum score of 4) |
| MATH 2A | Single-Variable Calculus I | 4 | MATH 1B (min C-) or SAT Math ≥650 or ACT Math ≥29 or Calculus Placement exam |
| MATH 2B | Single-Variable Calculus II | 4 | MATH 2A or MATH 5A or MATH 7A or AP Calculus AB ≥3 or AP Calculus BC ≥3 |

### ⚠️ Corrections to the original demo brief (found during research)

The brief's "Example ICS Courses to Use" list contained four errors that the
real catalogue contradicts. **Do not use the brief's versions in the demo:**

1. **ICS 45J prereq is NOT ICS 45C.** Actual: I&C SCI 33 (min C) or CSE 43 (min C). 45C and 45J are parallel "second language" courses, both gated on ICS 33.
2. **ICS 6D prereq is NOT ICS 6B (required) and NOT MATH 2A.** Actual: "Recommended: I&C SCI 6B" — a recommendation, not a hard prereq.
3. **IN4MATX 101 is NOT "Requirements Analysis & Engineering."** Actual: "Concepts in Programming Languages." Requirements Analysis and Engineering is **IN4MATX 113**.
4. **ICS 139W is NOT "Informatics Capstone."** Actual: I&C SCI 139W "Critical Writing on Information Technology" (prereq: Lower-Division Writing). The Informatics capstone is IN4MATX 191A/191B.
5. **COMPSCI 161 prereq is more than "ICS 6D, ICS 45C."** Actual: I&C SCI 46 (min C) and I&C SCI 6B and I&C SCI 6D and (MATH 2B or AP Calc BC ≥4).

These real-world confusions are reused deliberately as the failure material in
the Alternative and Bad flows below.

---

## 🎯 HAPPY FLOW — Multi-Level Prereq Chain to COMPSCI 161

**Input:**

```
DegreeWorks audit (excerpt):
Student: CS major, B.S. — Catalog Year 2024-25
COMPLETED:
  I&C SCI 31  — Introduction to Programming        — A  — Fall 2025   — 4 units
  I&C SCI 32  — Programming w/ Software Libraries  — A- — Winter 2026 — 4 units
  I&C SCI 33  — Intermediate Programming           — B+ — Spring 2026 — 4 units
  I&C SCI 6B  — Boolean Logic & Discrete Structures— B  — Spring 2026 — 4 units
  MATH 2A     — Single-Variable Calculus I         — B+ — Winter 2026 — 4 units
STILL NEEDED: COMPSCI 161 (Design and Analysis of Algorithms)

Question: "What do I still need before I can take COMPSCI 161?"
```

**Zotler Response:**

```
COMPSCI 161 — Design and Analysis of Algorithms (4 units) requires:
  • I&C SCI 46 (min grade C)      — ✗ not yet taken
  • I&C SCI 6B                    — ✓ completed Spring 2026 (B)
  • I&C SCI 6D                    — ✗ not yet taken
  • MATH 2B or AP Calc BC (4+)    — ✗ not yet taken

Working backward through the prereq chain:
  I&C SCI 46 requires I&C SCI 33 (✓ B+) AND I&C SCI 45C (✗)
  I&C SCI 45C requires I&C SCI 33 (✓ B+) — you're eligible NOW
  I&C SCI 6D lists I&C SCI 6B as recommended (✓) — you're eligible NOW
  MATH 2B requires MATH 2A (✓ B+) — you're eligible NOW

Fastest path (3 quarters):
  Fall 2026:   I&C SCI 45C + I&C SCI 6D + MATH 2B   (12 units)
  Winter 2027: I&C SCI 46                            (4 units)
  Spring 2027: COMPSCI 161 ✓ all prereqs satisfied

All prereqs pulled from catalogue.uci.edu.
```

**Validation Checklist:**
- ✅ All course IDs exist in the UCI ICS catalogue (MATH 2A/2B verified as prereq courses)
- ✅ COMPSCI 161 prereqs match verbatim: "I&C SCI 46 with a minimum grade of C and I&C SCI 6B and I&C SCI 6D and (MATH 2B or AP Calculus BC with a minimum score of 4)"
- ✅ I&C SCI 46 prereqs match: "I&C SCI 33 with a minimum grade of C and I&C SCI 45C with a minimum grade of C"
- ✅ I&C SCI 6D correctly treated as *recommended*-only gate ("Recommended: I&C SCI 6B")
- ✅ Units (4 each) and 3-level chain (33 → 45C → 46 → 161) accurate

**Notes:** Shows the core value proposition — Zotler resolves a *three-level*
prerequisite chain and sequences it into real quarters, something DegreeWorks
itself does not do. Every fact is checkable live on stage.

---

## ⚠️ ALTERNATIVE FLOW — "Does ICS 45J need ICS 45C first?" (Self-Correction)

**Input:**

```
Same audit as above. User asks:
"I finished I&CSCI 33 this spring. My friend said I have to take
ICS 45C before ICS 45J. Can I take ICS 45J in the fall?"
```

**Initial Misunderstanding:**

```
Zotler: "Checking ICS 45J — Programming in Java as a Second Language...
Since 45C and 45J are numbered sequentially, 45C is the prerequisite
for 45J, so you'd need to complete I&C SCI 45C first— 

...wait. Let me verify that against the catalogue instead of assuming
from the course numbers."
```

**Self-Correction:**

```
"Correction: the catalogue lists ICS 45J's prerequisite as
'I&C SCI 33 with a minimum grade of C or CSE 43 with a minimum grade of C'
— NOT ICS 45C. The 45-series are parallel 'second language' courses
(45C = C/C++, 45J = Java); both are gated on ICS 33, not on each other.

You completed I&C SCI 33 with a B+ (≥ C), so YES — you can take
ICS 45J in Fall 2026. Your friend's advice was a common misconception. ✓

One planning note: if COMPSCI 161 is your goal, ICS 45C is the one
that feeds I&C SCI 46 — 45J does not. Take 45C for the CS core;
45J is optional."
```

**Final Response:** Eligible for ICS 45J in Fall 2026 (prereq: ICS 33 min C ✓),
with the correct planning caveat that I&C SCI 46 requires 45C specifically.

**Why This Matters:**
- The "45C before 45J" myth is a *real* misconception (it even appeared in our own demo brief) — recovering from it live is authentic, not staged-looking
- Demonstrates catalogue validation overriding pattern-matching on course numbers
- The bonus caveat (46 needs 45C, not 45J) shows the tool preventing a downstream planning mistake, which builds trust in graceful degradation

---

## ❌ BAD FLOW — Fake Course + Propagated Wrong Label (No Validation)

**Input:**

```
"My DegreeWorks says I still need ICS 139W (Informatics Capstone).
Can I take it next quarter together with ICS 99X (Advanced Wizardry)?
My transcript shows: ICS 45J completed Spring 2026."
```

**Zotler Response (Failed):**

```
✓ ICS 139W — Informatics Capstone (4 units): requires senior standing
  in ICS. You'll want to save this for your final year.
✓ ICS 99X — Advanced Wizardry (4 units): prereq ICS 45J ✓ completed
  Spring 2026. You meet the requirements!
✓ Recommended: take both next quarter. Prereq chains satisfied. 🎉
```

**What Went Wrong:**
1. **ICS 99X does not exist** in the UCI catalogue — Zotler accepted it and invented a prereq relationship to ICS 45J
2. **Propagated the user's wrong label:** I&C SCI 139W is actually "Critical Writing on Information Technology" (prereq: Lower-Division Writing requirement) — not a capstone, and it has no senior-standing prereq. The Informatics capstone is IN4MATX 191A/191B
3. **Invented "senior standing in ICS"** as a prereq — plausible-sounding, catalogue says otherwise
4. No error message, no "did you mean...?", full confidence on fabricated data

**Feedback Insight:** Production Zotler needs:
- Hard validation of every course ID against a scraped catalogue index *before* answering (unknown ID → explicit error + fuzzy suggestion, e.g. "ICS 99X not found — did you mean ICS 90?")
- Title/ID cross-checking: when the user's label ("Informatics Capstone") doesn't match the catalogue title for that ID, flag the mismatch instead of adopting the user's framing
- Never emit a prereq that wasn't retrieved from catalogue data — no "plausible fill-in"

---

## Wiring in `extension/sidebar.js` (implemented)

The `SCRIPT` array in `sidebar.js` now carries six scripted flows, grounded
in the imported mock transcript (`data/user_courses.csv`: ICS 31, 32, 33,
6B, 6D, MATH 2A, 2B completed · ICS 45C in progress · GPA 3.51):

| Flow id | Beat | Trigger (chip or typed) |
|---|---|---|
| `cs-minor` | ⚠️ Alternative | Chip: "Can I add a CS minor?" — audits minor sections A–D, then self-corrects on the outside-the-school eligibility rule |
| `next-quarter` | ✅ Happy | Chip: "What should I take next quarter?" — ICS 46 + ICS 51, unlocks COMPSCI 161 |
| `graduation` | ✅ Happy | Chip: "When can I graduate?" — timeline + ICS 161 → COMPSCI 161 normalization |
| `electives` | ✅ Happy | Chip: "What ICS electives are available?" — eligibility-aware list |
| `45j-confusion` | ⚠️ Alternative | Type: **"Do I need ICS 45C before ICS 45J?"** |
| `fake-course` | ❌ Bad | Type: **"Can I take ICS 99X (Advanced Wizardry) with ICS 139W next quarter?"** |

Routing verified: each of the six inputs above scores highest on its own
flow in `matchFlow`. The bad-flow answer is deliberately, confidently wrong
— the presenter narrates the failure using the talk track in the JS comment
above it (fake course accepted, 139W mislabeled as capstone, invented
senior-standing prereq). Off-script questions hit `FALLBACK`, which steers
back to the supported topics instead of improvising.
