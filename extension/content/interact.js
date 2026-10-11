/* Per-note pointer, keyboard, drag, jump, and place-mode interactions.
   Binds note chrome actions and the placing overlay click target. */
(function (root) {
  'use strict';

  if (root.__KurippuSkipContent) return;
  const E = root.__KurippuEngine;
  if (!E) return;
  const K = E.K;

  /** Wire pointer, click, and keyboard handlers on a note element. */
  E.bindNote = function bindNote(el, id) {
    // Keep the page's own keyboard shortcuts away from our text box.
    ['keydown', 'keyup', 'keypress', 'input', 'beforeinput', 'paste', 'copy', 'cut'].forEach((t) =>
      el.addEventListener(t, (e) => e.stopPropagation()));
    el.addEventListener('contextmenu', (e) => { e.stopPropagation(); });
    el.addEventListener('pointerdown', (e) => {
      E.front(id);
      const band = e.target.closest('[data-drag]');
      if (band && !e.target.closest('[data-nodrag]') && e.button === 0) E.startDrag(id, e);
      e.stopPropagation();
    });
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const box = e.target.closest('[data-line]');
      if (box) { const n = E.notes.get(id); if (n) E.update(id, { text: K.toggleCheck(n.text, +box.dataset.line) }, true); return; }
      const btn = e.target.closest('[data-act]');
      if (btn) E.handleNoteAction(id, btn.dataset.act, btn);
    });
    el.addEventListener('dblclick', (e) => {
      if (!E.inEdit(E.notes.get(id)) && e.target.closest('.body') && !e.target.closest('a,[data-line]')) { e.stopPropagation(); E.startEdit(id); }
    });
    el.addEventListener('keydown', (e) => {
      const box = e.target.closest && e.target.closest('[data-line]');
      if (box && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); box.click(); return; }
      if (e.target.tagName !== 'TEXTAREA') return;
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); E.showPreview(id); }
    });
    el.addEventListener('input', (e) => {
      if (e.target.tagName !== 'TEXTAREA') return;
      E.fitRows(e.target);
      E.update(id, { text: e.target.value });
    });
  };

  /** Dispatch a note toolbar or lost-box action by name. */
  E.handleNoteAction = function handleNoteAction(id, action, button) {
    const n = E.notes.get(id);
    if (!n) return;
    switch (action) {
      case 'edit': E.startEdit(id); break;
      case 'preview': E.showPreview(id); break;
      // Keep the current mode while the chip is shown, so opening it restores the same editing state.
      case 'min': E.update(id, { min: true }, true); break;
      case 'expand': E.update(id, { min: false }, true); break;
      case 'del': E.trashNote(id); break;
      case 'color':
        E.update(id, { color: button.dataset.color }, true);
        E.settings.lastColor = button.dataset.color;
        E.db.patchSettings({ lastColor: button.dataset.color });
        break;
      case 'repin': E.repin(id); break;
      case 'keep': {
        const p = E.positionsById.get(id);
        E.update(id, { anchor: null, label: '', x: Math.round(p.x), y: Math.round(p.y) }, true);
        break;
      }
    }
    E.schedule();
  };

  /** Raise a note above siblings in z-order. */
  E.front = function front(id) {
    if (E.zIndexById.get(id) === E.zTop) return;
    E.zIndexById.set(id, ++E.zTop);
    const el = E.noteElementsById.get(id);
    const note = E.notes.get(id);
    if (el) el.style.zIndex = String(E.zTop + (E.inEdit(note) && !note.min ? 100000 : 0));
  };

  /** Finish a drag: throw, drop, or treat an unmoved chip tap as expand. */
  E.finishDrag = function finishDrag(id, dragSession, pointerEvent) {
    E.drag = null;
    if (E.held && E.held.id === id) E.held = null;
    const el = E.noteElementsById.get(id);
    if (el) el.classList.remove('dragging');
    const swing = E.swings.get(id);
    // preventDefault on pointerdown swallows the chip's click, so a tap opens it here instead.
    const chip = !dragSession.moved && pointerEvent.target.closest && pointerEvent.target.closest('[data-act="expand"]');
    // A tap that opens the chip should spring in clean, not squash from the release impulse.
    if (swing && !chip) E.applyReleaseImpulse(swing);
    if (dragSession.moved && swing && Math.abs(swing.vx) + Math.abs(swing.vy) > 3) E.coasts.set(id, { x: dragSession.x, y: dragSession.y });
    else if (dragSession.moved) E.drop(id, dragSession.x, dragSession.y);
    else {
      E.schedule();
      if (chip) E.handleNoteAction(id, 'expand', chip);
    }
  };

  /** Start dragging a note, including swing about the grip point. */
  E.startDrag = function startDrag(id, e) {
    let p = E.positionsById.get(id);
    // Grabbing a note that is still sliding from a throw catches it where it is.
    const c = E.coasts.get(id);
    if (c) { E.coasts.delete(id); p = { x: c.x, y: c.y }; }
    if (!p || p.x == null) return;
    e.preventDefault();
    const dragSession = {
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originPageX: p.x,
      originPageY: p.y,
      x: p.x,
      y: p.y,
      moved: false,
    };
    const el0 = E.noteElementsById.get(id);
    if (el0) {
      // The held point, measured from the note's centre, is the pivot it swings about.
      const r = el0.getBoundingClientRect();
      E.held = { id, px: e.clientX, py: e.clientY };
      E.startSwing(id, e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), e.clientX, e.clientY);
    }
    const move = (ev) => {
      if (E.held && E.held.id === id) { E.held.px = ev.clientX; E.held.py = ev.clientY; }
      if (Math.abs(ev.clientX - dragSession.startClientX) + Math.abs(ev.clientY - dragSession.startClientY) > 3) dragSession.moved = true;
      if (!dragSession.moved) return;
      E.drag = dragSession;
      dragSession.x = Math.max(0, dragSession.originPageX + ev.clientX - dragSession.startClientX);
      dragSession.y = Math.max(0, dragSession.originPageY + ev.clientY - dragSession.startClientY);
      const el = E.noteElementsById.get(id);
      if (el) { el.style.left = dragSession.x + 'px'; el.style.top = dragSession.y + 'px'; el.classList.add('dragging'); }
    };
    // On release a moving note is thrown: it keeps sliding in the swing loop and is only
    // pinned once it stops (see endCoast). Without animations it is pinned straight away.
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      E.finishDrag(id, dragSession, e);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  };

  /** Scroll to a note, expand if needed, and briefly pulse its outline. */
  E.jump = function jump(id) {
    const n = E.notes.get(id);
    const p = n && E.positionsById.get(id);
    if (!p || p.x == null) return;
    if (n.min) E.update(id, { min: false }, true);
    window.scrollTo({ top: Math.max(0, p.y - 160), left: Math.max(0, p.x - innerWidth + 340), behavior: 'smooth' });
    E.front(id);
    E.pulseId = id; E.schedule();
    setTimeout(() => { if (E.pulseId === id) { E.pulseId = null; E.schedule(); } }, 1500);
  };

  /** Enter place mode and show the crosshair overlay for one note. */
  E.startPlacing = function startPlacing(id) {
    E.placingId = id;
    E.overlay.innerHTML = `<div class="placing">${K.icon('crosshair', 14)}Click where this note belongs · Esc to cancel</div>`;
    E.overlay.classList.add('on');
  };

  /** Leave place mode and clear the overlay. */
  E.stopPlacing = function stopPlacing() {
    E.placingId = null;
    E.overlay.classList.remove('on');
    E.overlay.innerHTML = '';
  };

  E.overlay.addEventListener('click', (e) => {
    if (!E.placingId) return;
    e.stopPropagation();
    const id = E.placingId;
    E.stopPlacing();
    const x = e.clientX + scrollX, y = e.clientY + scrollY;
    E.placeAt(id, x, y);
    E.front(id);
    setTimeout(() => E.jump(id), 50);
  });
})(typeof self !== 'undefined' ? self : this);
