// Shared DegreeWorks CSV import logic for Zotler.
// Loaded by both the converter tab and the Settings tab so the two importers
// can never drift apart. Exposes a single global: ZotlerCSV.parse(text).

(function (global) {
  // The 12-column schema produced by the tutorial's AI prompt.
  const EXPECTED_COLUMNS = [
    "course_id", "course_name", "units", "grade", "term", "status",
    "source", "transfer_origin", "gpa_points", "req_block", "satisfies_req", "exception_note",
  ];

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

  // Parse DegreeWorks CSV text into course objects.
  // Returns { courses, error }: on failure courses is [] and error is a message.
  function parse(text) {
    const rows = parseCSV(text);

    if (rows.length < 2) {
      return { courses: [], error: "That CSV looks empty. Make sure it has a header row plus course rows." };
    }

    const header = rows[0].map(h => h.trim().toLowerCase());
    const idx = {};
    EXPECTED_COLUMNS.forEach(col => { idx[col] = header.indexOf(col); });

    if (idx.course_id === -1) {
      return {
        courses: [],
        error: "Couldn't find a \"course_id\" column. This importer expects the 12-column " +
               "DegreeWorks CSV from the tutorial prompt.",
      };
    }

    const courses = rows.slice(1).map(r => {
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
      return { courses: [], error: "No course rows found in that CSV." };
    }

    return { courses, error: null };
  }

  global.ZotlerCSV = { parse, EXPECTED_COLUMNS };
})(this);
