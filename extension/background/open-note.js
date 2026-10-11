/* Open a note from the options page and hand off a pending jump to its tab.
   Stores pending jumps in session storage until the content script is ready. */
(function (root) {
  'use strict';

  const BG = root.__KurippuBackground;
  const K = root.Kurippu;
  if (!BG) throw new Error('Background lifecycle missing: load lifecycle.js before open-note.js');

  /** Open the note's page and record a jump id for that new tab. */
  BG.openNote = async function openNote(id) {
    const n = await K.store.get(id);
    if (!n) return;
    const tab = await chrome.tabs.create({ url: K.hrefFor(n) });
    const { pendingJumps = {} } = await chrome.storage.session.get('pendingJumps');
    pendingJumps[tab.id] = id;
    await chrome.storage.session.set({ pendingJumps });
  };

  /** Take and clear the pending jump id for a tab, if any. */
  BG.takePendingJump = async function takePendingJump(tabId) {
    const { pendingJumps = {} } = await chrome.storage.session.get('pendingJumps');
    const id = pendingJumps[tabId];
    if (id) { delete pendingJumps[tabId]; await chrome.storage.session.set({ pendingJumps }); }
    return id || null;
  };

  /** Drop pending jumps when their tab is closed. */
  BG.onTabRemoved = async function onTabRemoved(tabId) {
    const { pendingJumps } = await chrome.storage.session.get('pendingJumps');
    if (pendingJumps && pendingJumps[tabId]) { delete pendingJumps[tabId]; chrome.storage.session.set({ pendingJumps }); }
  };
})(self);
