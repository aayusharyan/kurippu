/* Swing physics, coasting after a throw, pop-in, chip-open, and leave animations.
   Calls E.drop when a coast ends; drop is registered by a later script. */
(function (root) {
  'use strict';

  if (root.__KurippuSkipContent) return;
  const E = root.__KurippuEngine;
  if (!E) return;

  // How a note swings while carried and after it is let go. It is treated as a weight hanging from
  // the point it is held by: the weight trails the direction of travel, lags on a start, swings
  // forward on a stop and droops when held off-centre. Angles are in radians, distances in px.
  const HANG = 70, GYRATION = 40, GRAVITY = 900, DRAG = 3, INERTIA = 0.3;
  const ANG_K = 60, ANG_C = 4.6, MAX_ANG = 0.75;
  const SC_K = 300, SC_C = 14, LIFT_SCALE = 1.06;

  /** Whether motion is allowed by settings and prefers-reduced-motion. */
  E.animating = function animating() {
    return E.settings.motion !== false && !E.stillMq.matches;
  };

  /** Fresh swing state for a note that is about to move. */
  E.newSwing = function newSwing() {
    return { gx: 0, gy: 0, lx: 0, ly: 0, vx: 0, vy: 0, pvx: 0, pvy: 0, ang: 0, angV: 0, sc: 1, scV: 0 };
  };

  /** Advance a swing by dt seconds with damped springs; true when settled. */
  E.stepSwing = function stepSwing(s, dt, isHeld) {
    const ax = E.clamp((s.vx - s.pvx) / dt, -20000, 20000);
    const ay = E.clamp((s.vy - s.pvy) / dt, -20000, 20000);
    s.pvx = s.vx; s.pvy = s.vy;
    // The arm runs from the held point to the weight, turned by the current angle.
    const c0x = -s.gx, c0y = HANG - s.gy;
    const cos = Math.cos(s.ang), sin = Math.sin(s.ang);
    const cx = c0x * cos - c0y * sin, cy = c0x * sin + c0y * cos;
    // Forces on the weight: drag against travel, inertia against acceleration, gravity while held.
    const fx = -DRAG * s.vx - INERTIA * ax;
    const fy = -DRAG * s.vy - INERTIA * ay + (isHeld ? GRAVITY : 0);
    const torque = (cx * fy - cy * fx) / (c0x * c0x + c0y * c0y + GYRATION * GYRATION);
    s.angV += (torque - s.ang * ANG_K - s.angV * ANG_C) * dt;
    s.ang += s.angV * dt;
    if (Math.abs(s.ang) > MAX_ANG) { s.ang = Math.sign(s.ang) * MAX_ANG; s.angV = 0; }
    s.scV += (-(s.sc - (isHeld ? LIFT_SCALE : 1)) * SC_K - s.scV * SC_C) * dt;
    s.sc += s.scV * dt;
    return !isHeld && Math.abs(s.ang) < 0.001 && Math.abs(s.angV) < 0.01 && Math.abs(s.sc - 1) < 0.002 && Math.abs(s.scV) < 0.02;
  };

  /** Apply or clear swing CSS variables; translate pivots about the held point. */
  E.setSwing = function setSwing(el, s) {
    if (!el) return;
    el.style.removeProperty('transform');
    if (!s) {
      for (const p of ['--tx', '--ty', '--swing', '--sc']) el.style.removeProperty(p);
      return;
    }
    const cos = Math.cos(s.ang), sin = Math.sin(s.ang);
    const tx = s.gx - (s.gx * cos - s.gy * sin), ty = s.gy - (s.gx * sin + s.gy * cos);
    el.style.setProperty('--tx', tx.toFixed(2) + 'px');
    el.style.setProperty('--ty', ty.toFixed(2) + 'px');
    el.style.setProperty('--swing', (s.ang * 180 / Math.PI).toFixed(2) + 'deg');
    el.style.setProperty('--sc', s.sc.toFixed(4));
  };

  /** Begin swinging about (gx, gy) from centre, or null when motion is off. */
  E.startSwing = function startSwing(id, gx, gy, lx, ly) {
    if (!E.animating()) return null;
    const s = Object.assign(E.swings.get(id) || E.newSwing(), { gx, gy, lx: lx || 0, ly: ly || 0 });
    E.swings.set(id, s);
    if (!E.swingRaf) { E.swingLast = performance.now(); E.swingRaf = requestAnimationFrame(E.tick); }
    return s;
  };

  /** Pop a newly drawn note in oversized and askew until springs settle. */
  E.popIn = function popIn(id) {
    const s = E.startSwing(id, 0, 0);
    if (!s) return;
    s.sc = 1.3; s.ang = E.notes.size % 2 ? 0.2 : -0.2;
    E.setSwing(E.noteElementsById.get(id), s);
  };

  /** Spring a note open from its chip, a little oversized and askew, until it settles.
      A chip tap may already be swinging, so that swing is dropped and this one starts clean. */
  E.openFromChip = function openFromChip(id) {
    E.swings.delete(id);
    const s = E.startSwing(id, 0, 0);
    if (!s) return;
    s.sc = 1.15;
    s.ang = -0.12;
    E.setSwing(E.noteElementsById.get(id), s);
  };

  /** Landing squash on release; deeper when the note was moving faster. */
  E.applyReleaseImpulse = function applyReleaseImpulse(s) {
    s.vx = E.clamp(s.vx, -1800, 1800);
    s.vy = E.clamp(s.vy, -1800, 1800);
    s.scV -= 0.5 + Math.hypot(s.vx, s.vy) * 0.0012;
  };

  /** Pin a thrown note where it stopped sliding. */
  E.endCoast = function endCoast(id) {
    const c = E.coasts.get(id);
    E.coasts.delete(id);
    if (c && E.notes.has(id)) E.drop(id, c.x, c.y);
  };

  /** Clear every active swing and finish any coasts. */
  E.stopSwings = function stopSwings() {
    for (const id of E.swings.keys()) E.setSwing(E.noteElementsById.get(id), null);
    E.swings.clear();
    for (const id of [...E.coasts.keys()]) E.endCoast(id);
  };

  /** One frame for held speed, coasting slides, and spring settle. */
  E.tick = function tick(now) {
    const dt = Math.max(0.001, Math.min(0.032, (now - E.swingLast) / 1000));
    E.swingLast = now;
    E.swingRaf = 0;
    if (!E.animating()) { E.stopSwings(); return; }
    for (const [id, s] of E.swings) {
      const el = E.noteElementsById.get(id);
      // A missing element is a rebuild in progress, unless the note is gone, unplaced, or the site is hidden.
      if (!E.notes.has(id) || (!el && (E.positionsById.get(id)?.status === 'unplaced' || E.settings.hidden[E.page.site]))) {
        E.swings.delete(id); E.endCoast(id); continue;
      }
      if (!el) continue;
      const isHeld = !!E.held && E.held.id === id;
      const c = E.coasts.get(id);
      if (isHeld) {
        s.vx += ((E.held.px - s.lx) / dt - s.vx) * 0.3;
        s.vy += ((E.held.py - s.ly) / dt - s.vy) * 0.3;
        s.lx = E.held.px; s.ly = E.held.py;
      } else if (c && Math.abs(s.vx) + Math.abs(s.vy) > 3) {
        const vw = document.documentElement.clientWidth || innerWidth;
        const maxX = Math.max(scrollX, scrollX + vw - el.offsetWidth - 8);
        c.x += s.vx * dt; c.y += s.vy * dt;
        if (c.x < scrollX) { c.x = scrollX; s.vx *= -0.5; }
        if (c.x > maxX) { c.x = maxX; s.vx *= -0.5; }
        if (c.y < 0) { c.y = 0; s.vy *= -0.5; }
        const f = Math.exp(-5 * dt);
        s.vx *= f; s.vy *= f;
        el.style.left = Math.round(c.x) + 'px';
        el.style.top = Math.round(c.y) + 'px';
      } else {
        s.vx = s.vy = 0;
        if (c) E.endCoast(id);
      }
      const settled = E.stepSwing(s, dt, isHeld);
      if (settled && !E.coasts.has(id)) { E.swings.delete(id); E.setSwing(el, null); }
      else E.setSwing(el, s);
    }
    if (E.swings.size) E.swingRaf = requestAnimationFrame(E.tick);
  };

  /** Fade a note off the page and drop it from the element map immediately. */
  E.leave = function leave(id) {
    const el = E.noteElementsById.get(id);
    E.swings.delete(id); E.coasts.delete(id);
    if (!el) return;
    E.noteElementsById.delete(id); E.renderSignatureById.delete(id);
    if (!E.animating()) { el.remove(); return; }
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
})(typeof self !== 'undefined' ? self : this);
