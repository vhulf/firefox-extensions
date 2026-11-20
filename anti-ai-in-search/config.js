// Shared defaults for the Anti-AI Search extension.
// Imported by background.js, options.js and popup.js so the defaults and
// key names have a single source of truth.
export const DEFAULT_AI_STOP_STRING = '-ai';

// "Let the AI through" — the two storage keys behind the popup's
// filter-state radios (the only other contract between background.js and
// popup.js):
//   aiDisabled   — storage.local, boolean. Global off-switch; persists.
//   aiBypassTabs — storage.session, array of tab ids. Per-tab opt-out;
//                  survives service-worker restarts, cleared on browser
//                  restart (exactly the ephemerality a per-tab choice
//                  should have).
export const AI_DISABLED_KEY = 'aiDisabled';
export const AI_BYPASS_TABS_KEY = 'aiBypassTabs';

// Keyboard command for toggling the per-tab opt-out. The manifest cannot
// import JS, so the name is also hardcoded in manifest.json — keep them in
// sync. It deliberately has NO default shortcut (no suggested_key); users
// bind one in the browser's extension-shortcuts page if they want it.
export const TOGGLE_BYPASS_COMMAND = 'toggle-ai-bypass';

// Toolbar badge that marks a bypassed tab so the opt-out stays visible.
// Deep purple keeps the white "AI" text legible at 16px (the popup itself
// stays pastel; the badge is functional, not decorative).
export const BYPASS_BADGE_TEXT = 'AI';
export const BYPASS_BADGE_COLOR = '#7B3D8F';
