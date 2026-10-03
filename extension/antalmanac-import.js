// AntAlmanac plan import for Zotler.
// Reads AntAlmanac's JSON export (Import/Export → Export, visible in dev mode),
// resolves each section code to a course through the Anteater API, and builds
// student_plan.sqlite, whose course_code matches uci_ics_2026_27.sqlite's
// courses.course_code so the two can be joined with ATTACH.
// Exposes a single global: ZotlerAntAlmanac.

(function (global) {
  const WEBSOC_URL = "https://anteaterapi.com/v2/rest/websoc";
  const BATCH_SIZE = 50;
  const SCHEMA_VERSION = "1.0";
  const TERM_RE = /^(\d{4}) (Fall|Winter|Spring|Summer1|Summer10wk|Summer2)$/;

  // Accepts AntAlmanac's ScheduleSaveState ({ schedules, scheduleIndex }) or a
  // bare array of schedules. Mirrors the checks in AntAlmanac's JsonImportForm.
  function parseExport(text) {
    let data;
    try { data = JSON.parse(text); }
    catch { return { error: "That file isn't valid JSON. Export your schedule from AntAlmanac and try again." }; }

    const schedules = Array.isArray(data) ? data : data && data.schedules;
    if (!Array.isArray(schedules) || schedules.length === 0) {
      return { error: "No schedules found. Use AntAlmanac's Import/Export → Export to create the file." };
    }

    const result = [];
    for (let i = 0; i < schedules.length; i++) {
      const s = schedules[i];
      if (!s || typeof s.scheduleName !== "string" || !s.scheduleName) {
        return { error: `Schedule ${i + 1} is missing its scheduleName.` };
      }
      if (!Array.isArray(s.courses)) {
        return { error: `Schedule ${i + 1} is missing its courses list.` };
      }
      const courses = [];
      const seen = new Set();
      for (let j = 0; j < s.courses.length; j++) {
        const c = s.courses[j];
        if (!c || typeof c.sectionCode !== "string" || typeof c.term !== "string") {
          return { error: `Schedule ${i + 1}, course ${j + 1} is missing its sectionCode or term.` };
        }
        if (!parseTerm(c.term)) {
          return { error: `Schedule ${i + 1}, course ${j + 1} has an unrecognized term: ${c.term}` };
        }
        const sectionCode = c.sectionCode.trim();
        const key = `${c.term}|${sectionCode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        courses.push({ sectionCode, term: c.term });
      }
      result.push({ name: s.scheduleName, courses });
    }

    const index = Array.isArray(data) ? 0 : data.scheduleIndex;
    const activeIndex = Number.isInteger(index) && index >= 0 && index < result.length ? index : 0;
    return { schedules: result, activeIndex };
  }

  // "2026 Fall" → { year: "2026", quarter: "Fall" }
  function parseTerm(term) {
    const m = TERM_RE.exec(term);
    return m ? { year: m[1], quarter: m[2] } : null;
  }

  // Looks up every distinct (term, sectionCode) pair. Returns a Map keyed by
  // "term|sectionCode" → section details; codes the API doesn't know are absent.
  async function resolveSections(schedules, fetchImpl = global.fetch.bind(global)) {
    const byTerm = new Map();
    for (const s of schedules) {
      for (const c of s.courses) {
        if (!byTerm.has(c.term)) byTerm.set(c.term, new Set());
        byTerm.get(c.term).add(c.sectionCode);
      }
    }

    const found = new Map();
    for (const [term, codeSet] of byTerm) {
      const { year, quarter } = parseTerm(term);
      const codes = [...codeSet];
      for (let i = 0; i < codes.length; i += BATCH_SIZE) {
        const params = new URLSearchParams({ year, quarter, sectionCodes: codes.slice(i, i + BATCH_SIZE).join(",") });
        const res = await fetchImpl(`${WEBSOC_URL}?${params}`);
        if (!res.ok) throw new Error(`Anteater API returned ${res.status} for ${term}.`);
        const body = await res.json();
        if (!body.ok) throw new Error(`Anteater API error for ${term}: ${body.message || "unknown error"}`);
        for (const school of body.data.schools || []) {
          for (const dept of school.departments || []) {
            for (const course of dept.courses || []) {
              for (const sec of course.sections || []) {
                found.set(`${term}|${sec.sectionCode}`, {
                  course_code: `${course.deptCode} ${course.courseNumber}`,
                  title: course.courseTitle || null,
                  units: sec.units || null,
                  section_type: sec.sectionType || null,
                  instructors: (sec.instructors || []).join("; ") || null,
                  meetings_json: JSON.stringify(sec.meetings || []),
                });
              }
            }
          }
        }
      }
    }
    return found;
  }

  // Combines parsed schedules with resolved sections into the stored plan.
  async function importPlan(text, fetchImpl) {
    const parsed = parseExport(text);
    if (parsed.error) return parsed;
    const found = await resolveSections(parsed.schedules, fetchImpl);

    const rows = [];
    parsed.schedules.forEach((s, scheduleIndex) => {
      for (const c of s.courses) {
        const hit = found.get(`${c.term}|${c.sectionCode}`);
        rows.push({
          schedule_index: scheduleIndex,
          term: c.term,
          section_code: c.sectionCode,
          course_code: hit ? hit.course_code : null,
          title: hit ? hit.title : null,
          units: hit ? hit.units : null,
          section_type: hit ? hit.section_type : null,
          instructors: hit ? hit.instructors : null,
          meetings_json: hit ? hit.meetings_json : null,
          resolved: hit ? 1 : 0,
        });
      }
    });

    return {
      plan: {
        importedAt: new Date().toISOString(),
        schedules: parsed.schedules.map(s => s.name),
        activeIndex: parsed.activeIndex,
        rows,
      },
    };
  }

  // Builds student_plan.sqlite from a stored plan. `SQL` is the initialized
  // sql.js module. Returns the database file as a Uint8Array.
  function buildSqlite(SQL, plan) {
    const db = new SQL.Database();
    try {
      db.run(`
        CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE schedules(schedule_id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_active INTEGER NOT NULL);
        CREATE TABLE planned_sections(
          schedule_id INTEGER NOT NULL REFERENCES schedules,
          term TEXT NOT NULL,
          section_code TEXT NOT NULL,
          course_code TEXT,
          title TEXT,
          units TEXT,
          section_type TEXT,
          instructors TEXT,
          meetings_json TEXT,
          resolved INTEGER NOT NULL,
          PRIMARY KEY(schedule_id, term, section_code));
        CREATE INDEX idx_planned_course ON planned_sections(course_code);
        CREATE VIEW v_planned_courses AS
          SELECT DISTINCT s.name AS schedule, s.is_active, p.term, p.course_code, p.title
          FROM planned_sections p JOIN schedules s USING(schedule_id)
          WHERE p.course_code IS NOT NULL;
      `);

      const meta = db.prepare("INSERT INTO metadata VALUES (?, ?)");
      for (const [k, v] of [
        ["source", plan.source || "AntAlmanac JSON export"],
        ["imported_at", plan.importedAt],
        ["catalog", "uci_ics_2026_27.sqlite (join on courses.course_code)"],
        ["section_lookup", WEBSOC_URL],
        ["schema_version", SCHEMA_VERSION],
      ]) meta.run([k, v]);
      meta.free();

      const sched = db.prepare("INSERT INTO schedules VALUES (?, ?, ?)");
      plan.schedules.forEach((name, i) => sched.run([i + 1, name, i === plan.activeIndex ? 1 : 0]));
      sched.free();

      const sec = db.prepare("INSERT OR IGNORE INTO planned_sections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const r of plan.rows) {
        sec.run([r.schedule_index + 1, r.term, r.section_code, r.course_code, r.title, r.units,
                 r.section_type, r.instructors, r.meetings_json, r.resolved]);
      }
      sec.free();

      return db.export();
    } finally {
      db.close();
    }
  }

  const api = { parseExport, parseTerm, resolveSections, importPlan, buildSqlite };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.ZotlerAntAlmanac = api;
})(typeof window !== "undefined" ? window : globalThis);
