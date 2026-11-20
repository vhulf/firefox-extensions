// Toolbar-popup-only behavior: the "Full settings" button. options.html
// never loads this file — the filter-state radios are handled by options.js,
// which both pages share (the popup's markup adds the per-tab option the
// full settings page omits).
//
// Note: MV3's CSP (script-src 'self') forbids inline <script> on extension
// pages, so all popup logic must live in this external file.

// ---- Full settings button -----------------------------------------------
// Prefer runtime.openOptionsPage() (it respects options_ui in the manifest);
// if it is unavailable or rejects, fall back to opening options.html in a tab.
const openFullBtn = document.getElementById('open-full-settings');

if (openFullBtn) {
  const openOptionsTab = () => {
    const tab = browser.tabs.create({ url: browser.runtime.getURL('options.html') });
    tab?.catch?.((e) => console.error('[No-AI] tabs.create failed:', e));
  };

  openFullBtn.onclick = () => {
    const open = browser.runtime?.openOptionsPage?.bind(browser.runtime);
    if (typeof open === 'function') {
      try {
        const p = open();
        if (p?.catch) {
          p.catch((e) => {
            console.error('[No-AI] openOptionsPage failed, opening the options tab directly:', e);
            openOptionsTab();
          });
          return;
        }
      } catch (e) {
        console.error('[No-AI] openOptionsPage threw, opening the options tab directly:', e);
      }
    }
    openOptionsTab();
  };
}
