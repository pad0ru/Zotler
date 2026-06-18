// Cross-browser background script.
// Chrome/Chromium opens the extension's Side Panel; Firefox toggles its Sidebar.
// Runs as a service worker in Chrome and as an event-page script in Firefox.

const api = globalThis.browser ?? globalThis.chrome;

if (api.sidebarAction) {
  // Firefox — sidebarAction is Firefox-only. Toggle the sidebar on toolbar click.
  api.action.onClicked.addListener(() => {
    api.sidebarAction.toggle();
  });
} else if (api.sidePanel) {
  // Chrome/Chromium — open the side panel on toolbar click.
  api.action.onClicked.addListener((tab) => {
    api.sidePanel.open({ tabId: tab.id });
  });
  api.runtime.onInstalled.addListener(() => {
    api.sidePanel.setOptions({ enabled: true });
  });
}
