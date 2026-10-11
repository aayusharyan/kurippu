/* Storage adapters for real pages and the welcome demo.
   Chrome adapter mirrors store helpers; demo keeps notes in memory only. */
(function (root) {
  'use strict';

  if (root.__KurippuSkipContent) return;
  const E = root.__KurippuEngine;
  if (!E) return;
  const K = E.K;

  /** Adapter that reads and writes through chrome.storage via shared store helpers. */
  function chromeDb() {
    return {
      forUrl: (url) => K.store.forUrl(url),
      put: (n, groups) => K.store.put(n, { keepTime: true, groups }),
      trash: (id) => K.store.trash(id),
      restore: (id) => K.store.restore(id),
      settings: () => K.store.settings(),
      patchSettings: (p) => K.store.patchSettings(p),
      onChange(cb) {
        chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local') cb(changes); });
      },
    };
  }

  /** In-memory adapter for the welcome page so demo notes never hit storage. */
  function demoDb() {
    const notes = new Map();
    let settings = { ...K.DEFAULT_SETTINGS };
    return {
      forUrl: async (url) => [...notes.values()].filter((n) => n.url === url && !n.trashed),
      put: async (note) => {
        const stored = { ...note, updated: Date.now() };
        notes.set(note.id, stored);
        return stored;
      },
      trash: async (id) => {
        const note = notes.get(id);
        if (note) notes.set(id, { ...note, trashed: Date.now() });
      },
      restore: async (id) => {
        const note = notes.get(id);
        if (note) notes.set(id, { ...note, trashed: null });
      },
      // Same stored switch as web pages, so the welcome page can't animate when pages don't.
      settings: async () => {
        try { settings = await K.store.settings(); } catch (e) { /* keep the defaults */ }
        return settings;
      },
      patchSettings: async (p) => {
        try { return (settings = await K.store.patchSettings(p)); }
        catch (e) { return (settings = { ...settings, ...p }); }
      },
      onChange(cb) {
        try { chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local') cb(changes); }); } catch (e) {}
      },
    };
  }

  E.db = E.DEMO ? demoDb() : chromeDb();
})(typeof self !== 'undefined' ? self : this);
