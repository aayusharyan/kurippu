/* Shared page state and storage loading for the options page.
   Holds notes, trash, filters, Drive status, and reloads from chrome.storage. */

const K = window.Kurippu;

/** First element matching `selector`, inside `root` when one is given. */
export function query(selector, root) {
  return (root || document).querySelector(selector);
}

export { K };
export const esc = K.esc;
export const main = query('#main');

export const pageState = {
  notes: [], trash: [], placement: {}, settings: { ...K.DEFAULT_SETTINGS }, drive: {}, syncState: {}, driveJob: null,
  view: 'all', searchQuery: '', group: 'site', colorFilter: null, tagFilter: null, siteFilter: null, unplacedOnly: false,
  connecting: false, driveConfigured: true, redirect: '', syncBytes: 0, importMsg: '',
};

try { pageState.group = localStorage.getItem('kurippu.group') || 'site'; } catch (e) { /* storage blocked */ }

/** Load notes, settings, Drive, placement, and sync metadata into pageState. */
export async function load() {
  const [all, settings, drive, placement, { syncState = {}, driveJob = null }] = await Promise.all([
    K.store.allRaw(), K.store.settings(), K.store.drive(), K.store.placement(), chrome.storage.local.get(['syncState', 'driveJob']),
  ]);
  pageState.notes = all.filter((n) => !n.trashed && !n.purged);
  pageState.trash = all.filter((n) => n.trashed && !n.purged).sort((a, b) => b.trashed - a.trashed);
  pageState.settings = settings; pageState.drive = drive; pageState.placement = placement; pageState.syncState = syncState; pageState.driveJob = driveJob;
  try { pageState.syncBytes = await chrome.storage.sync.getBytesInUse(null); } catch (e) { pageState.syncBytes = 0; }
}

/** Ask the background whether Drive OAuth is configured for this build. */
export async function syncExtras() {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'drive', op: 'configured' });
    pageState.driveConfigured = !!(r && r.configured); pageState.redirect = (r && r.redirect) || '';
  } catch (e) { pageState.driveConfigured = false; }
}

/** Inject shared note CSS and show the installed extension version in the sidebar. */
export function initChrome() {
  const css = document.createElement('style');
  css.textContent = K.NOTE_CSS;
  document.head.appendChild(css);
  query('#version').textContent = 'Version ' + chrome.runtime.getManifest().version;
}

/** Debounced reload when chrome.storage changes; calls `onReload` after load. */
export function watchStorage(onReload) {
  let reloadTimer = 0;
  chrome.storage.onChanged.addListener(() => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => { await load(); onReload(true); }, 120);
  });
}
