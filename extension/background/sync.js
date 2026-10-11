/* Browser sync mirror between chrome.storage.local and chrome.storage.sync.
   Local is the source of truth; notes that exceed sync quotas stay local-only.
   Depends on lifecycle having created the background private namespace. */
(function (root) {
  'use strict';

  const BG = root.__KurippuBackground;
  const K = root.Kurippu;
  if (!BG) throw new Error('Background lifecycle missing: load lifecycle.js before sync.js');

  const SYNC_ITEM_MAX = (chrome.storage.sync.QUOTA_BYTES_PER_ITEM || 8192) - 64;
  const bytes = (key, val) => new TextEncoder().encode(key + JSON.stringify(val)).length;

  const dirty = new Set();
  let pushTimer = 0;

  /** Whether the user still wants browser sync enabled. */
  async function syncOn() {
    return (await K.store.settings()).browserSync !== false;
  }

  /** Write notes to sync, falling back item-by-item when the total quota is full. */
  async function writeSync(out, tooBig) {
    const state = (await chrome.storage.local.get('syncState')).syncState || {};
    let full = false;
    if (Object.keys(out).length) {
      try { await chrome.storage.sync.set(out); }
      catch (e) {
        // Over the total quota: write what fits, one by one.
        full = true;
        for (const k of Object.keys(out)) {
          try { await chrome.storage.sync.set({ [k]: out[k] }); } catch (e2) { break; }
        }
      }
    }
    const local = new Set([...(state.localOnly || []), ...tooBig]);
    Object.keys(out).forEach((k) => local.delete(k.slice(K.NOTE_PREFIX.length)));
    await chrome.storage.local.set({ syncState: { ...state, lastSync: Date.now(), full, localOnly: [...local].slice(0, 500) } });
  }

  /** Push dirty local note keys to sync after a short debounce. */
  async function pushDirty() {
    const keys = [...dirty];
    dirty.clear();
    if (!keys.length || !(await syncOn())) return;
    const [localByKey, syncByKey] = await Promise.all([chrome.storage.local.get(keys), chrome.storage.sync.get(keys)]);
    const out = {}, toLocal = {};
    const tooBig = [];
    keys.forEach((k) => {
      const localNote = localByKey[k];
      if (!localNote) return;
      const remoteNote = syncByKey[k];
      const mergedNotes = remoteNote && K.validNote(remoteNote) && K.validRevision(remoteNote)
        ? K.mergeNoteSets([localNote], [remoteNote])
        : [K.normalizeNote(localNote)];
      mergedNotes.forEach((note) => {
        const key = K.NOTE_PREFIX + note.id;
        if (!localByKey[key] || K.canonical(K.normalizeNote(localByKey[key])) !== K.canonical(note)) toLocal[key] = note;
        if (bytes(key, note) > SYNC_ITEM_MAX) tooBig.push(note.id);
        else out[key] = note;
      });
    });
    if (Object.keys(toLocal).length) await chrome.storage.local.set(toLocal);
    await writeSync(out, tooBig);
  }

  /** Merge incoming sync changes into local storage. */
  async function pullFromSync(changes) {
    if (!(await syncOn())) return;
    const keys = Object.keys(changes).filter((k) => K.isNoteKey(k) && changes[k].newValue);
    if (!keys.length) return;
    const localByKey = await chrome.storage.local.get(keys);
    const out = {}, toSync = {}, tooBig = [];
    keys.forEach((k) => {
      const remoteNote = changes[k].newValue;
      if (!K.validNote(remoteNote) || !K.validRevision(remoteNote)) return;
      const localNote = localByKey[k];
      const mergedNotes = localNote ? K.mergeNoteSets([localNote], [remoteNote]) : [K.normalizeNote(remoteNote)];
      mergedNotes.forEach((note) => {
        const key = K.NOTE_PREFIX + note.id;
        if (!localByKey[key] || K.canonical(K.normalizeNote(localByKey[key])) !== K.canonical(note)) out[key] = note;
        if (bytes(key, note) > SYNC_ITEM_MAX) tooBig.push(note.id);
        else toSync[key] = note;
      });
    });
    if (Object.keys(out).length) await chrome.storage.local.set(out);
    await writeSync(toSync, tooBig);
  }

  /** Fully reconcile both stores with the same causal resolver used by Drive. */
  BG.reconcileSync = async function reconcileSync() {
    if (!(await syncOn())) return;
    const [localByKey, syncByKey] = await Promise.all([chrome.storage.local.get(null), chrome.storage.sync.get(null)]);
    const toLocal = {}, toSync = {}, tooBig = [];
    const localNotes = Object.keys(localByKey).filter(K.isNoteKey).map((k) => localByKey[k]).filter((n) => K.validNote(n) && K.validRevision(n));
    const remoteNotes = Object.keys(syncByKey).filter(K.isNoteKey).map((k) => syncByKey[k]).filter((n) => K.validNote(n) && K.validRevision(n));
    K.mergeNoteSets(localNotes, remoteNotes).forEach((note) => {
      const key = K.NOTE_PREFIX + note.id;
      if (!localByKey[key] || K.canonical(K.normalizeNote(localByKey[key])) !== K.canonical(note)) toLocal[key] = note;
      if (bytes(key, note) > SYNC_ITEM_MAX) tooBig.push(note.id);
      else if (!syncByKey[key] || K.canonical(K.normalizeNote(syncByKey[key])) !== K.canonical(note)) toSync[key] = note;
    });
    if (Object.keys(toLocal).length) await chrome.storage.local.set(toLocal);
    await writeSync(toSync, tooBig);
  };

  /** React to local or sync storage changes: debounce pushes and schedule backups. */
  BG.onStorageChanged = function onStorageChanged(changes, area) {
    if (area === 'local') {
      const ids = Object.keys(changes).filter(K.isNoteKey);
      if (ids.length) {
        ids.forEach((k) => dirty.add(k));
        clearTimeout(pushTimer);
        pushTimer = setTimeout(pushDirty, 2500);
        BG.scheduleBackup();
      }
      if (changes.settings) {
        const was = changes.settings.oldValue && changes.settings.oldValue.browserSync;
        const now = changes.settings.newValue && changes.settings.newValue.browserSync;
        if (now && !was) BG.reconcileSync();
      }
    } else if (area === 'sync') {
      pullFromSync(changes);
    }
  };
})(self);
