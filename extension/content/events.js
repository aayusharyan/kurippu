/* Page listeners: shortcuts, layout triggers, SPA URL watch, storage, messages.
   Binds everything init needs before the first layout pass. */
(function (root) {
  'use strict';

  if (root.__KurippuSkipContent) return;
  const E = root.__KurippuEngine;
  if (!E) return;
  const K = E.K;

  const INTERACTIVE = 'a[href],button,input,textarea,select,label,summary,option,video,audio,iframe,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="link"],[role="textbox"],[role="menuitem"],[role="tab"],[role="checkbox"]';

  /** Whether the platform modifier (Ctrl or ⌘) is held without Alt. */
  E.modDown = function modDown(e) {
    return (K.isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey;
  };

  /** Bind context-menu memory, mod-click create, and Escape to cancel place. */
  E.bindNoteCreationShortcuts = function bindNoteCreationShortcuts() {
    // Remember where the last right-click happened, for the context menu item.
    window.addEventListener('contextmenu', (e) => {
      if (e.composedPath().includes(E.host)) return;
      E.lastCtx = { x: e.pageX, y: e.pageY };
    }, true);

    // Click can arrive after the button is up, with whatever modifier is held then.
    // Remember the modifier from the press, and only that press may add a note.
    let modifierHeldAtPress = false;
    window.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      modifierHeldAtPress = E.modDown(e) && !e.composedPath().includes(E.host);
    }, true);
    window.addEventListener('pointercancel', () => { modifierHeldAtPress = false; }, true);

    // Ctrl/⌘ + click on empty space adds a note. Links etc. behave as normal.
    window.addEventListener('click', (e) => {
      const heldFromPress = modifierHeldAtPress;
      modifierHeldAtPress = false;
      if (!heldFromPress || e.button !== 0 || !E.modDown(e) || e.composedPath().includes(E.host)) return;
      const t = e.target;
      if (!(t instanceof Element) || t.closest(INTERACTIVE)) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      E.createAt(e.pageX, e.pageY);
    }, true);

    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (E.placingId) { E.stopPlacing(); e.stopPropagation(); }
    }, true);
  };

  /** Bind resize, scroll, and mutation observers that call schedule. */
  E.bindLayoutTriggers = function bindLayoutTriggers() {
    window.addEventListener('resize', E.schedule);
    // Anchored notes follow elements inside scrolling containers too.
    document.addEventListener('scroll', (e) => { if (e.target !== document) E.schedule(); }, { capture: true, passive: true });
    const ro = new ResizeObserver(E.schedule);
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
    let mutationDebounceTimer = 0;
    new MutationObserver((mutations) => {
      if (mutations.every((mutation) => E.isOurs(mutation.target))) return;
      if (mutationDebounceTimer) return;
      mutationDebounceTimer = setTimeout(() => { mutationDebounceTimer = 0; E.schedule(); }, 400);
    }).observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
  };

  /** Poll location.href and reload notes when an SPA route changes. */
  E.bindSpaUrlWatcher = function bindSpaUrlWatcher() {
    if (E.DEMO) return;
    let href = location.href;
    setInterval(() => {
      if (location.href === href) return;
      href = location.href;
      const next = K.pageKey(href);
      if (!next || next.url === E.page.url) return;
      for (const id of E.saveTimers.keys()) E.flush(id);
      E.page = next;
      E.lastReport = '';
      E.loadNotes().then(E.schedule);
    }, 700);
  };

  /** Subscribe to storage changes and runtime messages. */
  E.bindStorageAndRuntime = function bindStorageAndRuntime() {
    E.db.onChange(E.onStorage);
    chrome.runtime.onMessage.addListener(E.onMessage);
  };

  /** Attach every page-level listener the engine needs. */
  E.bindEvents = function bindEvents() {
    E.bindNoteCreationShortcuts();
    E.bindLayoutTriggers();
    E.bindSpaUrlWatcher();
    E.bindStorageAndRuntime();
  };

  /** Apply a settings storage change; always returns true to redraw. */
  E.applySettingsChange = function applySettingsChange(change) {
    E.settings = { ...K.DEFAULT_SETTINGS, ...(change.newValue || {}) };
    return true;
  };

  /** Apply one note storage change; skip while its textarea is focused. */
  E.applyNoteStorageChange = function applyNoteStorageChange(key, change) {
    const storedNote = change.newValue;
    const id = key.slice(K.NOTE_PREFIX.length);
    if (!storedNote || storedNote.purged || storedNote.trashed) {
      if (E.notes.has(id)) { E.leave(id); E.notes.delete(id); if (E.focusId === id) E.focusId = null; return true; }
      return false;
    }
    if (storedNote.url !== E.page.url) {
      if (E.notes.has(id)) { E.leave(id); E.notes.delete(id); return true; }
      return false;
    }
    const current = E.notes.get(id);
    if (current && K.canonical(K.normalizeNote(current)) === K.canonical(K.normalizeNote(storedNote))) return false;
    const textarea = E.noteTextarea(id);
    if (textarea && E.shadow.activeElement === textarea) return false;
    E.notes.set(id, storedNote);
    E.anchorCache.delete(id);
    if (E.inEdit(storedNote) && textarea && textarea.value !== storedNote.text) {
      textarea.value = storedNote.text;
      E.fitRows(textarea);
    }
    return true;
  };

  /** React to chrome.storage.local changes for settings and notes. */
  E.onStorage = function onStorage(changes) {
    let dirty = false;
    for (const key in changes) {
      if (key === K.SETTINGS_KEY) {
        if (E.applySettingsChange(changes[key])) dirty = true;
        continue;
      }
      if (!K.isNoteKey(key)) continue;
      if (E.applyNoteStorageChange(key, changes[key])) dirty = true;
    }
    if (dirty) E.schedule();
  };

  /** Handle runtime messages from the service worker and other pages. */
  E.onMessage = function onMessage(msg, sender, reply) {
    if (!msg || typeof msg !== 'object') return;
    if (E.DEMO && msg.target !== 'welcome') return;
    switch (msg.type) {
      case 'add-at-context': {
        const p = E.lastCtx || { x: scrollX + innerWidth / 2 - 132, y: scrollY + innerHeight / 3 };
        E.createAt(p.x, p.y);
        break;
      }
      case 'new-note':
        E.createAt(scrollX + innerWidth / 2 - E.NOTE_W / 2, scrollY + innerHeight / 3);
        break;
      case 'jump': E.jump(msg.id); break;
      case 'place': E.startPlacing(msg.id); break;
      case 'get-status': {
        E.layout();
        const out = { url: E.page.url, ok: [], lost: [], unplaced: [] };
        for (const [id, p] of E.positionsById) if (E.notes.has(id)) out[E.statusBucket(p.status, 'ok')].push(id);
        reply(out);
        return;
      }
    }
  };
})(typeof self !== 'undefined' ? self : this);
