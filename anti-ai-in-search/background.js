import { PROVIDERS as DEFAULT_PROVIDERS } from './providers.js';
import {
  DEFAULT_AI_STOP_STRING, // Configurable via the "aiStopString" storage key
  AI_DISABLED_KEY,
  AI_BYPASS_TABS_KEY,
  TOGGLE_BYPASS_COMMAND,
  BYPASS_BADGE_TEXT,
  BYPASS_BADGE_COLOR,
} from './config.js';

// In-memory caches so the webRequest listener can stay synchronous.
let cachedProviders = [];
let cachedStopString = DEFAULT_AI_STOP_STRING;
let cachedAiPattern = buildAiPattern(DEFAULT_AI_STOP_STRING);

// "Let the AI through": the global off-switch and the per-tab bypass set.
// Like the caches above they are only refreshed by the onChanged handler
// below — the listener reads these, never storage.
let globalDisabled = false;
let bypassedTabs = new Set();

// Escape a string for safe use inside a RegExp pattern.
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build the "already appended" detection pattern from the stop string.
// If the stop string starts with a dash-like character, any common dash
// variant is accepted, so we never append the same string twice.
function buildAiPattern(stopString) {
  const s = (stopString ?? '').trim();
  if (!s) return null;

  let source;
  if (/^[-\u2013\u2014_]/.test(s)) {
    source = `[-\\u2013\\u2014_]${escapeRegExp(s.slice(1))}`;
  } else {
    source = escapeRegExp(s);
  }
  return new RegExp(source, 'i');
}

async function updateCaches() {
  const data = await browser.storage.local.get(['userProviders', 'aiStopString', AI_DISABLED_KEY]);

  const providers = data.userProviders || DEFAULT_PROVIDERS;

  // Ensure hostnamePatterns are RegExp objects
  cachedProviders = providers.map(p => ({
    ...p,
    hostnamePattern: p.hostnamePattern instanceof RegExp
      ? p.hostnamePattern
      : new RegExp(p.hostnamePattern),
    enabled: p.enabled !== false // Default to true if not explicitly set to false
  }));

  // Fall back to the default if the configured stop string is empty
  cachedStopString = (data.aiStopString ?? '').trim() || DEFAULT_AI_STOP_STRING;
  cachedAiPattern = buildAiPattern(cachedStopString);

  // Global off-switch (the popup's "Off everywhere" radio)
  const wasDisabled = globalDisabled;
  globalDisabled = data[AI_DISABLED_KEY] === true;

  // The badge means "AI is getting through in this tab", so a global
  // on/off flip re-badges every tab, not just the bypassed ones.
  if (globalDisabled !== wasDisabled) refreshAllBadges();
}

// The per-tab bypass list lives in session storage: it survives service-
// worker restarts but clears on browser restart — exactly the lifetime a
// per-tab opt-out should have. It is kept in sync via storage.onChanged;
// the Set (never storage) is what the synchronous listener reads.
async function updateBypassTabs() {
  const data = await browser.storage.session.get(AI_BYPASS_TABS_KEY);
  const next = new Set(data[AI_BYPASS_TABS_KEY] ?? []);

  const previous = bypassedTabs;
  bypassedTabs = next;

  // Keep the toolbar badge honest: it is how the user sees AI getting
  // through — re-evaluate every tab whose set membership changed.
  for (const tabId of new Set([...previous, ...next])) {
    setTabBadge(tabId, badgeShouldBeOn(tabId));
  }
}

// Cosmetic — never let a badge failure break cache refresh. Chrome's
// WebExtension API provides browser.action; older Firefox exposes
// browserAction, so take whichever exists.
const actionApi = browser.action ?? browser.browserAction;

// True when AI results pass through unfiltered in a tab: either the global
// off-switch is on (every tab) or the tab is in the per-tab bypass set.
function badgeShouldBeOn(tabId) {
  return globalDisabled || bypassedTabs.has(tabId);
}

// Re-badges every tab from the current state (used when the global switch
// flips). Never breaks cache refresh if the tabs API is unavailable.
async function refreshAllBadges() {
  const tabs = await browser.tabs?.query?.({});
  for (const tab of tabs ?? []) {
    setTabBadge(tab.id, badgeShouldBeOn(tab.id));
  }
}

function setTabBadge(tabId, on) {
  try {
    actionApi?.setBadgeText?.({ tabId, text: on ? BYPASS_BADGE_TEXT : '' })?.catch?.(() => {});
    if (on) actionApi?.setBadgeBackgroundColor?.({ tabId, color: BYPASS_BADGE_COLOR })?.catch?.(() => {});
  } catch {
    /* Engine without the action API: the badge just won't show. */
  }
}

// Initialize caches and listen for changes (also fires when the options
// page saves a new stop string, or the popup flips the filter state).
updateCaches();
updateBypassTabs();

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') updateCaches();
  else if (areaName === 'session') updateBypassTabs();
});

// Drop the entry when a bypassed tab closes. The write triggers
// updateBypassTabs (via onChanged), which refreshes the set AND clears the
// badge — so the set is only ever written there.
// A new tab inherits the global off-switch's badge (it starts in no
// per-tab bypass set, so only the global state applies).
browser.tabs?.onCreated?.addListener((tab) => {
  if (tab.id == null) return;
  setTabBadge(tab.id, badgeShouldBeOn(tab.id));
});

browser.tabs?.onRemoved?.addListener((tabId) => {
  if (!bypassedTabs.has(tabId)) return;
  const list = new Set(bypassedTabs);
  list.delete(tabId);
  browser.storage.session.set({ [AI_BYPASS_TABS_KEY]: [...list] }).catch(() => {});
});

// Optional keyboard command. The manifest defines it WITHOUT a default
// shortcut; users who want one bind it in the browser's extension-
// shortcuts page. Toggling writes storage — the onChanged handler above
// refreshes the set and the badge.
browser.commands?.onCommand?.addListener((command) => {
  if (command !== TOGGLE_BYPASS_COMMAND) return;
  browser.tabs
    .query({ active: true, lastFocusedWindow: true })
    .then(([tab]) => {
      if (!tab || tab.id == null || tab.id === -1) return;
      const list = new Set(bypassedTabs);
      if (list.has(tab.id)) list.delete(tab.id);
      else list.add(tab.id);
      return browser.storage.session.set({ [AI_BYPASS_TABS_KEY]: [...list] });
    })
    .catch((e) => console.error('[No-AI] command toggle failed:', e));
});

browser.webRequest.onBeforeRequest.addListener(
  function(details) {
    // Bypass checks first — both read in-memory state, so this stays
    // synchronous. tabId -1 means the request is not tied to a tab
    // (downloads, extension fetches); never bypass those.
    if (globalDisabled) return {};
    if (details.tabId !== -1 && bypassedTabs.has(details.tabId)) return {};

    let redirectUrl = null;
    try {
      const url = new URL(details.url);

      // Find a matching AND enabled provider
      const provider = cachedProviders.find(p =>
        p.enabled && p.hostnamePattern.test(url.hostname) && url.pathname.startsWith(p.pathPrefix)
      );

      if (provider) {
        const params = new URLSearchParams(url.search);
        const query = params.get(provider.queryParam);

        if (query && !cachedAiPattern.test(query)) {
          params.set(provider.queryParam, query + ' ' + cachedStopString);
          url.search = params.toString();
          const updatedUrl = url.toString();

          if (updatedUrl !== details.url) {
            redirectUrl = updatedUrl;
          }
        }
      }
    } catch (e) {
      console.error("[No-AI] Error processing request:", e);
    }

    if (redirectUrl) {
      return { redirectUrl: redirectUrl };
    }
    return {};
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);
