// Shared DegreeWorks CSV import logic for Zotler.
// Loaded by both the converter tab and the Settings tab so the two importers
// can never drift apart. Exposes a single global: ZotlerCSV.parse(text).

(function (global) {
  // The 12-column schema produced by the tutorial's AI prompt.
  const EXPECTED_COLUMNS = [
    "course_id", "course_name", "units", "grade", "term", "status",
    "source", "transfer_origin", "gpa_points", "req_block", "satisfies_req", "exception_note",
  ];

  // Special rows the AI prompt emits before the course rows: course_id is the
  // key, course_name is the value. Majors/minors may be numbered for multiple
  // degrees (_profile_major_1 .. _profile_major_10); the un-numbered form is
  // also accepted. Mapped onto the stored profile on import.
  const PROFILE_MAJOR_RE = /^_profile_major(_\d+)?$/;
  const PROFILE_MINOR_RE = /^_profile_minor(_\d+)?$/;
  const PROFILE_SCALAR_KEYS = {
    _profile_catalog_year: "catalog_year",
    _profile_audit_term: "audit_term",
  };

  // Minimal RFC-4180 parser: handles quoted fields, escaped quotes (""), and
  // commas / newlines inside quotes (the requirement columns are comma-heavy).
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }  // escaped quote
          else inQuotes = false;
        } else {
          field += c;
        }
        continue;
      }

      if (c === '"')                     { inQuotes = true; }
      else if (c === ",")                { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;        // CRLF
        row.push(field); field = "";
        if (row.some(v => v !== "")) rows.push(row);        // skip blank lines
        row = [];
      } else {
        field += c;
      }
    }
    if (field !== "" || row.length) {
      row.push(field);
      if (row.some(v => v !== "")) rows.push(row);
    }
    return rows;
  }

  // Parse DegreeWorks CSV text into course objects plus student profile metadata.
  // Returns { courses, profileMeta, error }: on failure courses is [] and error
  // is a message. profileMeta holds any _profile_* rows found (major, minor,
  // catalog_year, audit_term).
  function parse(text) {
    const rows = parseCSV(text);

    if (rows.length < 2) {
      return { courses: [], profileMeta: {}, error: "That CSV looks empty. Make sure it has a header row plus course rows." };
    }

    const header = rows[0].map(h => h.trim().toLowerCase());
    const idx = {};
    EXPECTED_COLUMNS.forEach(col => { idx[col] = header.indexOf(col); });

    if (idx.course_id === -1) {
      return {
        courses: [],
        profileMeta: {},
        error: "Couldn't find a \"course_id\" column. This importer expects the 12-column " +
               "DegreeWorks CSV from the tutorial prompt.",
      };
    }

    // Pull out the _profile_* metadata rows (key in course_id, value in course_name).
    const majors = [], minors = [];
    const profileMeta = { majors, minors };
    const dataRows = rows.slice(1).filter(r => {
      const id = (r[idx.course_id] ?? "").trim().toLowerCase();
      if (!id.startsWith("_profile_")) return true;
      const value = idx.course_name !== -1 ? (r[idx.course_name] ?? "").trim() : "";
      if (PROFILE_MAJOR_RE.test(id))           { if (value) majors.push(value); }
      else if (PROFILE_MINOR_RE.test(id))      { if (value) minors.push(value); }
      else if (PROFILE_SCALAR_KEYS[id])        { profileMeta[PROFILE_SCALAR_KEYS[id]] = value; }
      return false;  // drop any _profile_* row from the course list, even unrecognized ones
    });
    // Joined forms for display / the stored profile's single-string fields.
    if (majors.length) profileMeta.major = majors.join(" / ");
    if (minors.length) profileMeta.minor = minors.join(" / ");

    const courses = dataRows.map(r => {
      const get = col => (idx[col] !== -1 ? (r[idx[col]] ?? "").trim() : "");
      return {
        course_id:       get("course_id"),
        course_name:     get("course_name"),
        units:           parseFloat(get("units")) || 0,
        grade:           get("grade"),
        term:            get("term"),
        status:          get("status") || "completed",
        source:          get("source") || "uci",
        transfer_origin: get("transfer_origin"),
        gpa_points:      parseFloat(get("gpa_points")) || 0,
        req_block:       get("req_block"),
        satisfies_req:   get("satisfies_req"),
        exception_note:  get("exception_note"),
      };
    }).filter(c => c.course_id);  // drop rows with no course id

    if (courses.length === 0) {
      return { courses: [], profileMeta, error: "No course rows found in that CSV." };
    }

    return { courses, profileMeta, error: null };
  }

  global.ZotlerCSV = { parse, EXPECTED_COLUMNS };
})(this);
