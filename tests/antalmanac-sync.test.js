const test = require("node:test");
const assert = require("node:assert");

// Minimal chrome.storage.local stand-in.
const store = {};
globalThis.chrome = { storage: { local: {
  get: async key => ({ [key]: store[key] }),
  set: async obj => { Object.assign(store, obj); },
} } };

globalThis.ZotlerAntAlmanac = require("../extension/antalmanac-import.js");
require("../extension/antalmanac-sync.js");
const { sync, describe } = globalThis.ZotlerAntAlmanacSync;

// Shape returned by AntAlmanac's schedule.get (superjson-wrapped fetchUserDataByUserId).
const SIGNED_IN = { result: { data: { json: { id: "u1", userData: {
  scheduleIndex: 0,
  schedules: [{ id: "s1", index: 0, scheduleName: "Fall plan", scheduleNote: "", customEvents: [],
    courses: [{ sectionCode: "36130", term: "2026 Fall", color: "#f00", visibility: "visible" }] }],
} } } } };

let websocCalls = 0;
globalThis.fetch = async url => {
  websocCalls++;
  const code = new URL(url).searchParams.get("sectionCodes");
  return { ok: true, json: async () => ({ ok: true, data: { schools: [{ departments: [{ courses: [{
    deptCode: "I&C SCI", courseNumber: "45J", courseTitle: "PROGRAMMING IN JAVA",
    sections: [{ sectionCode: code, sectionType: "Lec", units: "4", instructors: [], meetings: [] }],
  }] }] }] } }) };
};

const reply = (status, body) => async () => ({ status, ok: status < 400, json: async () => body });

test("signed-out reply records signed_out", async () => {
  const result = await sync({ fetchImpl: reply(401, {}) });
  assert.strictEqual(result.status, "signed_out");
  assert.match(describe(result), /Open antalmanac\.com/);
});

test("signed-in reply stores a resolved plan", async () => {
  const result = await sync({ fetchImpl: reply(200, SIGNED_IN) });
  assert.strictEqual(result.status, "synced");
  assert.strictEqual(result.count, 1);
  assert.strictEqual(store.plannedSchedule.rows[0].course_code, "I&C SCI 45J");
  assert.strictEqual(store.plannedSchedule.source, "AntAlmanac sync");
});

test("unchanged schedules skip the section lookup", async () => {
  const before = websocCalls;
  const result = await sync({ fetchImpl: reply(200, SIGNED_IN) });
  assert.strictEqual(result.status, "synced");
  assert.strictEqual(websocCalls, before);
});

test("server errors are reported, not thrown", async () => {
  const result = await sync({ fetchImpl: reply(500, {}) });
  assert.strictEqual(result.status, "error");
  assert.match(describe(result), /500/);
});
