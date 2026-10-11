/* Layout pass, note DOM paint, and placement status reporting.
   Schedules redraws and builds edit, preview, and mini note chrome. */
(function (root) {
  'use strict';

  if (root.__KurippuSkipContent) return;
  const E = root.__KurippuEngine;
  if (!E) return;
  const K = E.K;

  /** Queue a layout pass on the next animation frame. */
  E.schedule = function schedule() {
    cancelAnimationFrame(E.raf);
    E.raf = requestAnimationFrame(E.layout);
  };

  /** Position every note, paint or remove elements, and report status. */
  E.layout = function layout() {
    E.mount();
    const hidden = !!E.settings.hidden[E.page.site];
    // Clamp to the visible width so a note never widens the page.
    const vw = document.documentElement.clientWidth || innerWidth;
    for (const n of E.notes.values()) E.positionsById.set(n.id, E.computePos(n));
    for (const id of [...E.noteElementsById.keys()]) if (!E.notes.has(id) || hidden) E.removeEl(id);
    if (!hidden) {
      for (const n of E.notes.values()) {
        const p = E.positionsById.get(n.id);
        if (p.status === 'unplaced') { E.removeEl(n.id); continue; }
        const el = E.render(n, p);
        const width = n.min ? 26 : E.NOTE_W;
        const maxX = Math.max(scrollX, scrollX + vw - width - 8);
        el.style.left = Math.round(Math.max(0, Math.min(p.x, maxX))) + 'px';
        el.style.top = Math.round(Math.max(0, p.y)) + 'px';
        el.style.zIndex = String((E.zIndexById.get(n.id) || 1) + (E.inEdit(n) && !n.min ? 100000 : 0));
        // After left/top, so a fresh note pops once it is on the page, an opened chip springs, and a swing survives a rebuild.
        if (!E.swings.has(n.id) && E.arrivals.has(n.id)) { E.arrivals.delete(n.id); E.popIn(n.id); }
        if (E.chipOpens.has(n.id)) { E.chipOpens.delete(n.id); E.openFromChip(n.id); }
        if (E.swings.has(n.id)) E.setSwing(el, E.swings.get(n.id));
      }
    }
    E.report();
  };

  /** Map a placement status to the report bucket name (`placedKey` for on-page). */
  E.statusBucket = function statusBucket(status, placedKey) {
    if (status === 'unplaced') return 'unplaced';
    if (status === 'lost') return 'lost';
    return placedKey;
  };

  /** Send placement counts to the service worker when they change. */
  E.report = function report() {
    if (E.DEMO) return;
    const placed = [], lost = [], unplaced = [];
    const buckets = { placed, lost, unplaced };
    for (const [id, p] of E.positionsById) {
      if (!E.notes.has(id)) continue;
      buckets[E.statusBucket(p.status, 'placed')].push(id);
    }
    const sig = JSON.stringify([E.page.url, placed.length + lost.length, unplaced, lost, !!E.settings.hidden[E.page.site]]);
    if (sig === E.lastReport) return;
    E.lastReport = sig;
    chrome.runtime.sendMessage({
      type: 'status', url: E.page.url, count: placed.length + lost.length, unplaced, lost, ok: placed,
      hidden: !!E.settings.hidden[E.page.site],
    }).catch(() => {});
  };

  /** Detach a note element without deleting the note record. */
  E.removeEl = function removeEl(id) {
    const el = E.noteElementsById.get(id);
    if (el) el.remove();
    E.noteElementsById.delete(id); E.renderSignatureById.delete(id);
    // The note is still here, so the next time it is drawn it should arrive again instead of popping in on a dead element.
    if (E.notes.has(id) && E.swings.has(id)) E.arrivals.add(id);
  };

  /** Whether a note is in saved edit mode (missing mode stays preview). */
  E.inEdit = function inEdit(n) {
    return !!(n && n.mode === 'edit');
  };

  /** Return the note element, creating and binding it on first draw. */
  E.ensureNoteElement = function ensureNoteElement(note) {
    const existing = E.noteElementsById.get(note.id);
    if (existing) return existing;
    const element = document.createElement('div');
    element.dataset.id = note.id;
    E.layer.appendChild(element);
    E.noteElementsById.set(note.id, element);
    E.bindNote(element, note.id);
    return element;
  };

  /** Apply palette and shape classes, and play minimise or open motion.
      A chip drops in only when an open note is minimised; a later redraw keeps that class so the drop-in is not restarted. Opening a chip springs the note. */
  E.applyNoteChrome = function applyNoteChrome(element, note, position, signature) {
    const palette = K.palette(note.color);
    const editing = E.inEdit(note);
    const minimized = !!note.min;
    const lost = position.status === 'lost';
    const wasMini = element.classList.contains('mini');
    const startingChipIn = minimized && !wasMini && element.classList.contains('note') && E.animating();
    const chipIn = minimized && (startingChipIn || element.classList.contains('chip-in'));
    E.renderSignatureById.set(note.id, signature);
    element.style.setProperty('--k-fill', palette.fill);
    element.style.setProperty('--k-band', palette.band);
    element.style.setProperty('--k-code', palette.code);
    const nextClass = ['note', minimized ? 'mini' : '', chipIn ? 'chip-in' : '', editing ? 'editing' : '', lost ? 'lost' : '', E.pulseId === note.id ? 'pulse' : ''].filter(Boolean).join(' ');
    if (element.className !== nextClass) element.className = nextClass;
    if (startingChipIn) {
      element.addEventListener('animationend', (event) => {
        if (event.animationName === 'k-chip-in') element.classList.remove('chip-in');
      }, { once: true });
    }
    if (!minimized && wasMini && E.animating()) E.chipOpens.add(note.id);
  };

  /** Fill a minimised note with its expand chip (tap expands via startDrag). */
  E.fillMiniContent = function fillMiniContent(element, note) {
    element.innerHTML = `<button class="mini-btn" data-drag data-act="expand" title="${K.esc(K.firstLine(note.text))}" aria-label="Expand note"></button>`;
  };

  /** HTML for the note band with edit/preview, minimise, and delete. */
  E.bandHtml = function bandHtml(editing) {
    return `
      <div class="band" data-drag>
        <div class="seg" data-nodrag role="group" aria-label="Mode"><button aria-pressed="${editing}" data-act="edit">Edit</button><button aria-pressed="${!editing}" data-act="preview">Preview</button></div>
        <span class="flex"></span>
        <button class="ib" data-nodrag data-act="min" title="Minimise note" aria-label="Minimise note">${K.icon('minus')}</button>
        <button class="ib" data-nodrag data-act="del" title="Delete note" aria-label="Delete note">${K.icon('trash')}</button>
      </div>`;
  };

  /** HTML for the lost-anchor warning, or empty when the note is placed. */
  E.lostBlockHtml = function lostBlockHtml(note, position) {
    if (position.status !== 'lost') return '';
    return `
      <div class="lost-box">
        <div class="lost-msg">${K.icon('alert', 13)}<span>Couldn’t find “${K.esc(note.label || 'its anchor')}”. Showing it where you left it.</span></div>
        <div class="lost-actions" data-nodrag><button data-act="repin">Pin to nearby text</button><button data-act="keep">Keep here</button></div>
      </div>`;
  };

  /** Paint the editing body and restore caret or focus after recreate. */
  E.fillEditingContent = function fillEditingContent(element, note, band, lostBlock) {
    const swatches = K.COLORS.map((c) => {
      const swatch = K.palette(c);
      return `<button class="sw${swatch.bordered ? ' bordered' : ''}" data-act="color" data-color="${c}" role="radio" aria-checked="${c === note.color}" title="${c}" style="background:${swatch.swatch}"></button>`;
    }).join('');
    const previousTextarea = element.querySelector('textarea');
    const caret = previousTextarea && E.shadow.activeElement === previousTextarea ? [previousTextarea.selectionStart, previousTextarea.selectionEnd] : null;
    element.innerHTML = `${band}
      <textarea data-nodrag placeholder="Write in Markdown…" spellcheck="true" aria-label="Note text (Markdown)"></textarea>
      <div class="foot" data-nodrag role="radiogroup" aria-label="Color">${swatches}<span class="keys" title="${K.modLabel}+Enter to preview">${K.modLabel} + Enter</span></div>
      ${lostBlock}`;
    const textarea = element.querySelector('textarea');
    textarea.value = note.text;
    E.fitRows(textarea);
    if (E.focusId === note.id || caret) {
      textarea.focus({ preventScroll: true });
      if (E.focusId === note.id) textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      else textarea.setSelectionRange(caret[0], caret[1]);
      if (E.focusId === note.id) E.focusId = null;
    }
  };

  /** Paint the Markdown preview body. */
  E.fillPreviewContent = function fillPreviewContent(element, note, band, lostBlock) {
    element.innerHTML = `${band}
      <div class="body k-md">${K.md(note.text)}</div>
      ${lostBlock}`;
  };

  /** Create or update the DOM for one note at the given position. */
  E.render = function render(note, position) {
    const editing = E.inEdit(note);
    const minimized = !!note.min;
    const lost = position.status === 'lost';
    const signature = JSON.stringify([editing, minimized, note.color, lost, editing ? '' : note.text, note.label, E.pulseId === note.id]);
    const existing = E.noteElementsById.get(note.id);
    if (existing && E.renderSignatureById.get(note.id) === signature) return existing;
    const element = E.ensureNoteElement(note);
    E.applyNoteChrome(element, note, position, signature);
    if (minimized) {
      E.fillMiniContent(element, note);
      return element;
    }
    const lostBlock = E.lostBlockHtml(note, position);
    const band = E.bandHtml(editing);
    if (editing) {
      E.fillEditingContent(element, note, band, lostBlock);
      return element;
    }
    E.fillPreviewContent(element, note, band, lostBlock);
    return element;
  };

  /** Size a textarea to its line count (+1), at least four rows. */
  E.fitRows = function fitRows(ta) {
    ta.rows = Math.max(4, ta.value.split('\n').length + 1);
  };
})(typeof self !== 'undefined' ? self : this);
