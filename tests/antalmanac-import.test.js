const test = require("node:test");
const assert = require("node:assert");
const initSqlJs = require("sql.js");
const A = require("../extension/antalmanac-import.js");

const EXPORT = {
  scheduleIndex: 1,
  schedules: [
    { scheduleName: "Plan A", customEvents: [], courses: [
      { sectionCode: "36130", term: "2026 Fall", color: "#f00" },
      { sectionCode: "99999", term: "2026 Fall", color: "#0f0" },
    ] },
    { scheduleName: "Plan B", customEvents: [], courses: [
      { sectionCode: "36190", term: "2026 Fall", color: "#00f" },
      { sectionCode: "36190", term: "2026 Fall", color: "#00f" },
    ] },
  ],
};

// Minimal Anteater websoc response for the two real sections above.
function fakeFetch(url) {
  const codes = new URL(url).searchParams.get("sectionCodes").split(",");
  const known = {
    "36130": { courseNumber: "45J", courseTitle: "PROGRAMMING IN JAVA" },
    "36190": { courseNumber: "60", courseTitle: "GAMES AND SOCIETY" },
  };
  const courses = codes.filter(c => known[c]).map(c => ({
    deptCode: "I&C SCI", ...known[c],
    sections: [{ sectionCode: c, sectionType: "Lec", units: "4", instructors: ["STAFF"], meetings: [] }],
  }));
  return Promise.resolve({ ok: true, json: () => ({ ok: true, data: { schools: [{ departments: [{ courses }] }] } }) });
}

test("parseExport rejects invalid input", () => {
  assert.match(A.parseExport("nope").error, /valid JSON/);
  assert.match(A.parseExport("{}").error, /No schedules/);
  assert.match(A.parseExport('[{"scheduleName":"x","courses":[{"term":"2026 Fall"}]}]').error, /sectionCode/);
  assert.match(A.parseExport('[{"scheduleName":"x","courses":[{"sectionCode":"1","term":"Fall"}]}]').error, /term/);
});

test("parseExport accepts a bare array and dedupes sections", () => {
  assert.strictEqual(A.parseExport('[{"scheduleName":"x","courses":[]}]').activeIndex, 0);
  const parsed = A.parseExport(JSON.stringify(EXPORT));
  assert.strictEqual(parsed.activeIndex, 1);
  assert.strictEqual(parsed.schedules[1].courses.length, 1);
});

test("parseTerm splits AntAlmanac terms", () => {
  assert.deepStrictEqual(A.parseTerm("2026 Summer10wk"), { year: "2026", quarter: "Summer10wk" });
  assert.strictEqual(A.parseTerm("Fall 2026"), null);
});

test("importPlan resolves sections and keeps unknown codes", async () => {
  const { plan } = await A.importPlan(JSON.stringify(EXPORT), fakeFetch);
  assert.deepStrictEqual(plan.rows.map(r => [r.section_code, r.course_code, r.resolved]), [
    ["36130", "I&C SCI 45J", 1],
    ["99999", null, 0],
    ["36190", "I&C SCI 60", 1],
  ]);
});

test("buildSqlite writes the planned_sections schema", async () => {
  const { plan } = await A.importPlan(JSON.stringify(EXPORT), fakeFetch);
  const SQL = await initSqlJs();
  const db = new SQL.Database(A.buildSqlite(SQL, plan));
  const rows = db.exec("SELECT schedule, is_active, course_code FROM v_planned_courses ORDER BY course_code")[0].values;
  assert.deepStrictEqual(rows, [["Plan A", 0, "I&C SCI 45J"], ["Plan B", 1, "I&C SCI 60"]]);
  db.close();
});
