// Keeps Zotler's planned classes in sync with the student's saved AntAlmanac
// schedules, so nothing has to be exported by hand.
// Uses AntAlmanac's own (internal, undocumented) tRPC route schedule.get with
// the student's existing AntAlmanac login, so it only sees saved changes.
// Section lookup and the stored plan come from antalmanac-import.js, which
// must be loaded first. Exposes a single global: ZotlerAntAlmanacSync.
//
// Runs two ways:
//  - From the sidebar and Settings, which call sync() whenever they open.
//  - As a content script on antalmanac.com, which syncs on load, on tab focus
//    and every minute, as a fallback if the browser withholds the login
//    cookie from extension pages.

(function (global) {
  const ORIGIN = "https://antalmanac.com";
  const SCHEDULE_PATH = "/api/trpc/schedule.get";
  const POLL_MS = 60 * 1000;
  let syncing = null;

  function setStatus(status, extra = {}) {
    const value = { status, at: new Date().toISOString(), ...extra };
    return chrome.storage.local.set({ antalmanacSync: value }).then(() => value);
  }

  async function runSync(url, fetchImpl) {
    try {
      const res = await fetchImpl(url, { credentials: "include" });
      if (res.status === 401) return setStatus("signed_out");
      if (!res.ok) throw new Error(`AntAlmanac returned ${res.status}`);
      const body = await res.json();
      const userData = body && body.result && body.result.data && body.result.data.json && body.result.data.json.userData;
      if (!userData || !Array.isArray(userData.schedules) || userData.schedules.length === 0) {
        return setStatus("no_schedules");
      }

      // Only re-resolve section codes when the saved schedules actually changed.
      const sourceKey = JSON.stringify([userData.scheduleIndex,
        userData.schedules.map(s => [s.scheduleName, s.courses.map(c => c.term + "|" + c.sectionCode)])]);
      const { plannedSchedule } = await chrome.storage.local.get("plannedSchedule");
      if (plannedSchedule && plannedSchedule.sourceKey === sourceKey) {
        return setStatus("synced", { count: plannedSchedule.rows.length });
      }

      const { plan, error } = await ZotlerAntAlmanac.importPlan(JSON.stringify(userData));
      if (error) return setStatus("error", { message: error });
      plan.source = "AntAlmanac sync";
      plan.sourceKey = sourceKey;
      await chrome.storage.local.set({ plannedSchedule: plan });
      return setStatus("synced", { count: plan.rows.length });
    } catch (err) {
      return setStatus("error", { message: err.message });
    }
  }

  // Concurrent callers share one in-flight sync.
  function sync({ url = ORIGIN + SCHEDULE_PATH, fetchImpl = fetch.bind(global) } = {}) {
    if (!syncing) syncing = runSync(url, fetchImpl).finally(() => { syncing = null; });
    return syncing;
  }

  // One-line, student-facing description of a stored antalmanacSync status.
  function describe(sync) {
    if (!sync) return "";
    const time = new Date(sync.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return {
      synced: `Synced ${sync.count} planned class${sync.count !== 1 ? "es" : ""} from AntAlmanac · ${time}`,
      signed_out: "Sign in at antalmanac.com to sync your planned classes automatically",
      no_schedules: "No saved AntAlmanac schedules yet — save one in AntAlmanac and it will appear here",
      error: `AntAlmanac sync failed: ${sync.message || "unknown error"}`,
    }[sync.status] || "";
  }

  global.ZotlerAntAlmanacSync = { sync, describe };

  // Content-script mode on antalmanac.com: same-origin request with the page's cookies.
  if (global.location && global.location.hostname === "antalmanac.com") {
    // Firefox content scripts need content.fetch to send the page's cookies.
    const pageFetch = typeof content !== "undefined" && content.fetch ? content.fetch.bind(content) : fetch.bind(global);
    const pageSync = () => {
      if (document.visibilityState === "visible") sync({ url: SCHEDULE_PATH, fetchImpl: pageFetch });
    };
    pageSync();
    document.addEventListener("visibilitychange", pageSync);
    global.addEventListener("focus", pageSync);
    setInterval(pageSync, POLL_MS);
  }
})(typeof window !== "undefined" ? window : globalThis);
