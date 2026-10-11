/* Note model writes: debounced saves, create, place, edit, trash.
   Queues per-note writes so delete cannot race ahead of a prior save. */
(function (root) {
  'use strict';

  if (root.__KurippuSkipContent) return;
  const E = root.__KurippuEngine;
  if (!E) return;
  const K = E.K;

  /** Run fn after a promise settles, success or failure, so one failure cannot stall the queue. */
  E.runWhetherPreviousSucceeded = function runWhetherPreviousSucceeded(previousWrite, fn) {
    return previousWrite.then(fn, fn);
  };

  /** Swallow a write result so a rejection does not block the next write. */
  E.ignoreWriteResult = function ignoreWriteResult(write) {
    return write.then(() => undefined, () => undefined);
  };

  /** Queue fn behind this note's previous write. */
  E.afterWrite = function afterWrite(id, fn) {
    const previousWrite = E.writes.get(id) || Promise.resolve();
    const next = E.runWhetherPreviousSucceeded(previousWrite, fn);
    E.writes.set(id, E.ignoreWriteResult(next));
    return next;
  };

  /** Persist the current in-memory note, including blanks; skip if already deleted. */
  E.persist = function persist(id) {
    return E.afterWrite(id, () => {
      const n = E.notes.get(id);
      if (!n) return null;
      const groups = [...(E.pendingGroups.get(id) || [])];
      E.pendingGroups.delete(id);
      return E.db.put(n, groups).then((stored) => {
        const current = E.notes.get(id);
        if (stored && current && stored.text === current.text) E.notes.set(id, { ...current, _sync: stored._sync });
        return stored;
      });
    });
  };

  /** Patch a note in memory and schedule or flush a save. */
  E.update = function update(id, patch, immediate) {
    const n = E.notes.get(id);
    if (!n) return;
    E.notes.set(id, { ...n, ...patch, updated: Date.now() });
    const groups = E.pendingGroups.get(id) || new Set();
    K.groupsForKeys(Object.keys(patch)).forEach((group) => groups.add(group));
    E.pendingGroups.set(id, groups);
    clearTimeout(E.saveTimers.get(id));
    const save = () => {
      E.saveTimers.delete(id);
      E.persist(id);
    };
    if (immediate) save();
    else E.saveTimers.set(id, setTimeout(save, 450));
    if (patch.text == null || !E.inEdit(E.notes.get(id))) E.schedule();
  };

  /** Flush a pending debounced save for a note immediately. */
  E.flush = function flush(id) {
    if (!E.saveTimers.has(id)) return;
    clearTimeout(E.saveTimers.get(id)); E.saveTimers.delete(id);
    E.persist(id);
  };

  /** Return the note's textarea, or null when it is not on the page. */
  E.noteTextarea = function noteTextarea(id) {
    const element = E.noteElementsById.get(id);
    return element ? element.querySelector('textarea') : null;
  };

  /** Open one note for writing; other notes keep their mode. */
  E.startEdit = function startEdit(id) {
    const n = E.notes.get(id);
    if (!n) return;
    E.focusId = id;
    E.front(id);
    if (E.inEdit(n) && !n.min) {
      const ta = E.noteTextarea(id);
      if (ta) { ta.focus({ preventScroll: true }); E.focusId = null; }
      return;
    }
    E.update(id, n.min ? { mode: 'edit', min: false } : { mode: 'edit' }, true);
  };

  /** Switch this note to preview; blank notes stay, like on the site. */
  E.showPreview = function showPreview(id) {
    const n = E.notes.get(id);
    if (!n || !E.inEdit(n)) return;
    if (E.focusId === id) E.focusId = null;
    E.update(id, { mode: 'preview' }, true);
  };

  /** Move a note to the trash and take it off the page. */
  E.trashNote = function trashNote(id) {
    if (E.focusId === id) E.focusId = null;
    clearTimeout(E.saveTimers.get(id)); E.saveTimers.delete(id);
    E.pendingGroups.delete(id);
    E.leave(id);
    E.notes.delete(id);
    E.afterWrite(id, () => E.db.trash(id));
    E.schedule();
  };

  /** Create a new note at page coordinates and open it for editing. */
  E.createAt = function createAt(x, y) {
    if (E.settings.hidden[E.page.site]) return;
    x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
    const found = E.findAnchor(x, y);
    const id = K.newId();
    const n = {
      id, url: E.page.url, site: E.page.site, path: E.page.path, scheme: E.DEMO ? 'https:' : location.protocol,
      title: E.DEMO ? 'Welcome' : document.title.slice(0, 120),
      color: E.settings.lastColor || 'amber', text: '', mode: 'edit', created: Date.now(), updated: Date.now(),
      x, y, anchor: found ? found.anchor : null, label: found ? found.label : '',
    };
    E.notes.set(id, n); E.arrivals.add(id);
    E.focusId = id;
    E.front(id);
    E.update(id, {}, true);
  };

  /** Re-anchor a note at page coordinates and save placement. */
  E.placeAt = function placeAt(id, x, y) {
    x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
    const found = E.findAnchor(x + 16, y + 16);
    if (found) {
      found.anchor.dx -= 16;
      found.anchor.dy -= 16;
    }
    E.anchorCache.delete(id);
    E.update(id, { x, y, anchor: found ? found.anchor : null, label: found ? found.label : '' }, true);
  };

  /** Try to re-pin a lost note to nearby text, or keep fallback coordinates. */
  E.repin = function repin(id) {
    const p = E.positionsById.get(id);
    if (!p || p.x == null) return;
    const found = E.findAnchor(p.x + 16, p.y + 16);
    if (found) E.placeAt(id, p.x, p.y);
    else E.update(id, { anchor: null, label: '', x: Math.round(p.x), y: Math.round(p.y) }, true);
  };

  /** Pin a note at page position after a drag or coast, and save that spot. */
  E.drop = function drop(id, x, y) {
    E.placeAt(id, x, y);
  };
})(typeof self !== 'undefined' ? self : this);
