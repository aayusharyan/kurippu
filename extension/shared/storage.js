/* chrome.storage.local helpers for notes, settings, and Drive state.
   Pages and content scripts send mutations through the service worker;
   the worker writes locally. Depends on note-reconciliation helpers on the builder. */
(function (root) {
  'use strict';

  const B = root.__KurippuBuilder;

  B.NOTE_PREFIX = 'n:';
  B.SETTINGS_KEY = 'settings';
  B.SYNC_META_KEY = 'replicaState';
  // `motion` stays on this device, so a slow machine can turn note animations off without affecting others.
  B.DEFAULT_SETTINGS = { browserSync: true, lastColor: 'amber', hidden: {}, motion: true };
  const DEFAULT_DRIVE = { connected: false, schedule: 'change' };

  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  const local = hasChrome ? chrome.storage.local : null;
  const isWorker = typeof ServiceWorkerGlobalScope !== 'undefined' && root instanceof ServiceWorkerGlobalScope;

  /** Create a short unique note id. */
  B.newId = function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  /** Whether a storage key is a per-note record. */
  B.isNoteKey = function isNoteKey(k) {
    return k.startsWith(B.NOTE_PREFIX);
  };

  /** Ask the service worker to serialize a local mutation. */
  async function requestMutation(message) {
    const result = await chrome.runtime.sendMessage({ type: 'store-mutation', ...message });
    if (!result || result.error) throw new Error((result && result.error) || 'Could not save the note.');
    return result.note || result.notes || null;
  }

  B.store = {
    async allRaw() {
      const all = await local.get(null);
      return Object.keys(all).filter(B.isNoteKey).map((k) => all[k]).filter((n) => n && n.id);
    },
    /** Live notes (not trashed, not purged). */
    async all() { return (await B.store.allRaw()).filter((n) => !n.trashed && !n.purged); },
    async trashed() { return (await B.store.allRaw()).filter((n) => n.trashed && !n.purged); },
    async forUrl(url) { return (await B.store.all()).filter((n) => n.url === url); },
    async get(id) { return (await local.get(B.NOTE_PREFIX + id))[B.NOTE_PREFIX + id] || null; },
    async put(note, opts) {
      if (!isWorker && chrome.runtime && chrome.runtime.sendMessage) {
        return requestMutation({
          op: 'put', note, keepTime: !!(opts && opts.keepTime),
          groups: opts && opts.groups || null,
        });
      }
      const n = { ...note };
      if (!opts || !opts.keepTime) n.updated = Date.now();
      const epoch = ((await local.get('mutationEpoch')).mutationEpoch || 0) + 1;
      await local.set({ [B.NOTE_PREFIX + n.id]: n, mutationEpoch: epoch });
      return n;
    },
    async putMany(notes, opts) {
      if (!isWorker && chrome.runtime && chrome.runtime.sendMessage) {
        return requestMutation({ op: 'putMany', notes, preserveSync: !!(opts && opts.preserveSync) });
      }
      const obj = {};
      notes.forEach((n) => { obj[B.NOTE_PREFIX + n.id] = n; });
      if (notes.length) {
        obj.mutationEpoch = ((await local.get('mutationEpoch')).mutationEpoch || 0) + 1;
        await local.set(obj);
      }
      return notes;
    },
    async patch(id, patch) {
      const cur = await B.store.get(id);
      if (!cur) return null;
      return B.store.put({ ...cur, ...patch }, { groups: B.groupsForKeys(Object.keys(patch)) });
    },
    trash(id) { return B.store.patch(id, { trashed: Date.now() }); },
    restore(id) { return B.store.patch(id, { trashed: null }); },
    /** Keep a tiny tombstone so other devices delete the note too. */
    async purge(id) {
      const cur = await B.store.get(id);
      if (!cur) return;
      await B.store.put({ ...cur, purged: true }, { groups: ['lifecycle'] });
    },
    async settings() {
      const s = (await local.get(B.SETTINGS_KEY))[B.SETTINGS_KEY] || {};
      return { ...B.DEFAULT_SETTINGS, ...s };
    },
    async patchSettings(patch) {
      const cur = await B.store.settings();
      const next = { ...cur, ...patch };
      await local.set({ [B.SETTINGS_KEY]: next });
      return next;
    },
    async drive() {
      const d = (await local.get('drive')).drive || {};
      // Older releases stored a Google display name that is no longer needed.
      // Remove it when Drive state is next read so the value is not retained.
      if (Object.prototype.hasOwnProperty.call(d, 'name')) {
        const withoutName = { ...d };
        delete withoutName.name;
        await local.set({ drive: withoutName });
        return { ...DEFAULT_DRIVE, ...withoutName };
      }
      return { ...DEFAULT_DRIVE, ...d };
    },
    async patchDrive(patch) {
      const next = { ...(await B.store.drive()), ...patch };
      await local.set({ drive: next });
      return next;
    },
    async placement() { return (await local.get('placement')).placement || {}; },
  };

  /** Drop fields JSON export should not carry. Minimised chip state (`min`)
     still syncs and backs up with the live note; only the export omits it. */
  B.portable = function portable(n) {
    const { min, ...rest } = n;
    return rest;
  };
})(typeof self !== 'undefined' ? self : this);
