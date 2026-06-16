// Zotler — ASSIST articulation API client (public endpoints, no key required)
// Exposes window.ASSIST for converter.js

window.ASSIST = (() => {
  const BASE = "https://prod.assistng.org";

  let _institutions = null;
  let _years = null;
  let _uciId = null;

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ASSIST HTTP ${res.status}`);
    return res.json();
  }

  async function getInstitutions() {
    if (!_institutions) {
      _institutions = await fetchJSON(`${BASE}/Institutions/api`);
    }
    return _institutions;
  }

  async function ensureUCIId() {
    if (_uciId) return _uciId;
    const list = await getInstitutions();
    const uci = list.find(i =>
      !i.isCommunityCollege &&
      (i.names ?? []).some(n => /irvine/i.test(n.name ?? n))
    );
    if (!uci) throw new Error("UCI not found in ASSIST institutions.");
    _uciId = uci.id;
    return _uciId;
  }

  function getCCCs() {
    if (!_institutions) return [];
    return _institutions
      .filter(i => i.isCommunityCollege)
      .map(i => ({
        id:   i.id,
        name: (i.names?.[0]?.name ?? i.name ?? "Unknown").trim(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function getYears() {
    if (_years) return _years;
    try {
      const raw = await fetchJSON(`${BASE}/api/Years`);
      // Response may be an array or wrapped in a property
      _years = Array.isArray(raw) ? raw : (raw.years ?? raw.data ?? []);
    } catch {
      // Fallback: ASSIST NG uses sequential IDs starting roughly at 66 for 2021-22
      _years = [
        { id: 70, label: "2025–2026" },
        { id: 69, label: "2024–2025" },
        { id: 68, label: "2023–2024" },
        { id: 67, label: "2022–2023" },
        { id: 66, label: "2021–2022" },
      ];
    }
    return _years;
  }

  async function getAgreements(cccId, yearId) {
    const uciId = await ensureUCIId();
    // "for/{receiving}/to/{sending}" — UCI receives credits from CCC
    return fetchJSON(
      `${BASE}/articulation/api/Agreements/Published/for/${uciId}/to/${cccId}/in/${yearId}?types=Major`
    );
  }

  async function getAgreement(key) {
    return fetchJSON(
      `${BASE}/articulation/api/Agreements?Key=${encodeURIComponent(key)}`
    );
  }

  // Flatten a raw agreement response into { ccCourse, uciCourse } pairs.
  // Handles multiple known ASSIST NG response shapes.
  function parseMappings(raw) {
    const arts =
      raw?.result?.articulations ??
      raw?.articulations ??
      (Array.isArray(raw) ? raw : []);

    const out = [];
    for (const art of arts) {
      if (art.sendingArticulation?.noArticulationReason) continue;

      const uciItems = coerceCourses(art.templateCell ?? art.receivingArticulation);
      const ccItems  = coerceCourses(art.sendingArticulation ?? art.sending);

      if (!ccItems.length || !uciItems.length) continue;

      for (const cc of ccItems) {
        for (const uci of uciItems) {
          if (cc.id && uci.id) out.push({ ccCourse: cc, uciCourse: uci });
        }
      }
    }
    return out;
  }

  function coerceCourses(node) {
    if (!node) return [];
    const list = node.courses ?? node.items ?? (node.courseNumber ? [node] : []);
    return list.map(c => {
      const prefix = (c.prefix ?? c.deptCode ?? "").trim();
      const num    = (c.courseNumber ?? c.number ?? "").trim();
      return {
        id:    [prefix, num].filter(Boolean).join(" "),
        title: (c.courseTitle ?? c.title ?? "").trim(),
        units: parseFloat(c.minUnits ?? c.units ?? 0) || 0,
      };
    }).filter(c => c.id);
  }

  return { getInstitutions, getCCCs, getYears, getAgreements, getAgreement, parseMappings };
})();
