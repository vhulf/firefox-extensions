// Shared UI logic for the two settings surfaces: the full tab page
// (options.html) and the compact toolbar popup (popup.html). Both share
// element ids (not logic); ids the full page omits (the per-tab state
// radio, the add-error slot, …) are tolerated below.

import { PROVIDERS as DEFAULT_PROVIDERS } from './providers.js';
import { DEFAULT_AI_STOP_STRING, AI_DISABLED_KEY, AI_BYPASS_TABS_KEY } from './config.js';

const listContainer = document.getElementById('providers-list');
const addBtn = document.getElementById('add-provider');
const stopStringInput = document.getElementById('ai-stop-string');
const savedIndicator = document.getElementById('stop-string-saved');
// Optional inline add-error slot (popup.html has one; options.html doesn't).
const addError = document.getElementById('add-error');

async function loadProviders() {
  const data = await browser.storage.local.get('userProviders');
  return data.userProviders || DEFAULT_PROVIDERS;
}

function renderProviders(providers) {
  listContainer.innerHTML = '';
  providers.forEach((p, index) => {
    const row = document.createElement('tr');
    if (p.enabled === false) {
      row.className = 'inactive';
    }

    const patternStr = p.hostnamePattern instanceof RegExp 
      ? p.hostnamePattern.source 
      : p.hostnamePattern;

    // Name cell
    const nameCell = document.createElement('td');
    const strongName = document.createElement('strong');
    strongName.textContent = p.name;
    nameCell.appendChild(strongName);
    row.appendChild(nameCell);

    // Pattern cell
    const patternCell = document.createElement('td');
    patternCell.textContent = patternStr;
    row.appendChild(patternCell);

    // Path cell
    const pathCell = document.createElement('td');
    pathCell.textContent = p.pathPrefix || '(root)';
    row.appendChild(pathCell);

    // Param cell
    const paramCell = document.createElement('td');
    const codeParam = document.createElement('code');
    codeParam.textContent = p.queryParam;
    paramCell.appendChild(codeParam);
    row.appendChild(paramCell);

    // Toggle cell
    const toggleCell = document.createElement('td');
    toggleCell.style.textAlign = 'center';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'toggle';
    toggle.checked = p.enabled !== false;
    toggle.dataset.index = index;
    toggleCell.appendChild(toggle);
    row.appendChild(toggleCell);

    // Delete cell
    const deleteCell = document.createElement('td');
    deleteCell.style.textAlign = 'center';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.dataset.index = index;
    deleteCell.appendChild(deleteBtn);
    row.appendChild(deleteCell);

    listContainer.appendChild(row);
  });

  // Add event listeners for toggles and deletes
  listContainer.querySelectorAll('.toggle').forEach(el => {
    el.onchange = async (e) => {
      const index = e.target.dataset.index;
      const providersUpdated = [...providers];
      providersUpdated[index].enabled = e.target.checked;
      await browser.storage.local.set({ userProviders: providersUpdated });
      renderProviders(providersUpdated); // Re-render to update row styles (active/inactive)
    };
  });

  listContainer.querySelectorAll('.delete-btn').forEach(el => {
    el.onclick = async (e) => {
      const index = e.target.dataset.index;
      const providersUpdated = providers.filter((_, i) => i !== parseInt(index));
      await browser.storage.local.set({ userProviders: providersUpdated });
      renderProviders(providersUpdated);
    };
  });
}

addBtn.onclick = async () => {
  const name = document.getElementById('new-name').value;
  const domain = document.getElementById('new-domain').value;
  const path = document.getElementById('new-path').value;
  const param = document.getElementById('new-param').value;

  if (!name || !domain || !param) {
    if (addError) {
      addError.hidden = false;
    } else {
      alert('Please fill in all required options...');
    }
    return;
  }

  const providers = await loadProviders();
  const newProvider = {
    name,
    hostnamePattern: domain,
    pathPrefix: path || '',
    queryParam: param,
    enabled: true
  };

  const updated = [...providers, newProvider];
  await browser.storage.local.set({ userProviders: updated });
  
  // Clear inputs
  document.getElementById('new-name').value = '';
  document.getElementById('new-domain').value = '';
  document.getElementById('new-path').value = '';
  document.getElementById('new-param').value = '';
  if (addError) addError.hidden = true;

  renderProviders(updated);
};

// --- AI stop string ------------------------------------------------
// The background script watches storage.onChanged, so saving here
// takes effect immediately with no reload needed.
async function loadStopString() {
  const data = await browser.storage.local.get('aiStopString');
  stopStringInput.value = (data.aiStopString ?? '').trim() || DEFAULT_AI_STOP_STRING;
}

let savedTimeout;
stopStringInput.addEventListener('change', async () => {
  const value = stopStringInput.value.trim();
  if (value) {
    await browser.storage.local.set({ aiStopString: value });
  } else {
    await browser.storage.local.remove('aiStopString'); // Fall back to the default
  }
  await loadStopString(); // Re-display the effective (normalized) value
  savedIndicator.hidden = false;
  clearTimeout(savedTimeout);
  savedTimeout = setTimeout(() => { savedIndicator.hidden = true; }, 2000);
});

// --- Addon state ---------------------------------------------------
// The filter-state radios. Three in the toolbar popup; the full settings
// page intentionally shows only the two browser-wide options (no per-tab
// radio — that is a per-tab choice, this page is for the whole browser).
// Like the rest of this file, a pure writer: only storage is written
// (local for the global switch, session for the per-tab list) and
// background.js reacts via storage.onChanged, driving its caches + badge.
// The checked state always reflects storage when the page opens.

const stateRadios = {
  active: document.getElementById('state-active'),
  'this-tab': document.getElementById('state-this-tab'),
  everywhere: document.getElementById('state-everywhere'),
};

// The config cards that become moot while the addon is off everywhere.
const configCards = () => document.querySelectorAll('.table-container:not(.state-box)');

async function activeTabId() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.id != null ? tab.id : null;
  } catch {
    return null; // no usable tab context (e.g. unusual embedding)
  }
}

async function currentFilterState() {
  const [local, session] = await Promise.all([
    browser.storage.local.get(AI_DISABLED_KEY),
    browser.storage.session.get(AI_BYPASS_TABS_KEY),
  ]);
  if (local[AI_DISABLED_KEY] === true) return 'everywhere';
  // Only the popup offers the per-tab state; without that radio, a
  // bypassed current tab displays as "active" rather than leaving every
  // option unchecked.
  if (stateRadios['this-tab']) {
    const tabId = await activeTabId();
    if (tabId != null && (session[AI_BYPASS_TABS_KEY] ?? []).includes(tabId)) return 'this-tab';
  }
  return 'active';
}

function selectState(state) {
  for (const [value, el] of Object.entries(stateRadios)) {
    if (el) el.checked = value === state;
  }
  // While the whole addon is off, the config cards below don't matter.
  for (const card of configCards()) {
    card.classList?.toggle('card-muted', state === 'everywhere');
  }
}

async function applyFilterState(state) {
  const tabId = await activeTabId();
  const [, session] = await Promise.all([
    browser.storage.local.get(AI_DISABLED_KEY),
    browser.storage.session.get(AI_BYPASS_TABS_KEY),
  ]);

  // Global off-switch (local storage — an explicit user choice that persists
  // across restarts).
  await browser.storage.local.set({ [AI_DISABLED_KEY]: state === 'everywhere' });

  // Per-tab list (session storage — cleared on browser restart). Syncing it
  // here keeps the popup in this tab in agreement: picking "Anti-AI on" also
  // un-bypasses the current tab so normal filtering is fully restored.
  const list = new Set(session[AI_BYPASS_TABS_KEY] ?? []);
  if (tabId != null) {
    if (state === 'active') list.delete(tabId);
    if (state === 'this-tab') list.add(tabId);
    // "everywhere" leaves earlier per-tab choices untouched: they are inert
    // while the global switch is off, and picking "active" again removes
    // this tab.
  }
  await browser.storage.session.set({ [AI_BYPASS_TABS_KEY]: [...list] });

  selectState(state);
}

// Initial load
loadProviders().then(renderProviders);
loadStopString();
currentFilterState()
  .then(selectState)
  .catch((e) => console.error('[No-AI] reading filter state failed:', e));

for (const [value, el] of Object.entries(stateRadios)) {
  el?.addEventListener?.('change', () => {
    if (!el.checked) return;
    applyFilterState(value).catch((e) => console.error('[No-AI] applying filter state failed:', e));
  });
}
