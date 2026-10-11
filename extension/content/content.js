/* Kurippu - the in-page note engine.
   Runs as a content script on web pages, and on welcome.html in demo mode
   (window.KURIPPU_DEMO), where notes live in memory only.
   On the product website origins it also announces that the extension is
   installed (version only, never note content) so the page can update its UI. */
(function () {
  'use strict';
  if (window.__kurippuLoaded) return;
  window.__kurippuLoaded = true;
  // A previous copy may have left its host behind when the extension reloaded. Drop it before building a new one.
  document.querySelectorAll('kurippu-notes').forEach((el) => el.remove());

  const K = window.Kurippu;
  const DEMO = !!window.KURIPPU_DEMO;
  const NOTE_W = 232;

  // Product site hosts that may listen for a presence signal. Not localhost.
  const SITE_ORIGINS = [
    'https://kurippu.yush.dev',
    'https://kurippu-510919.web.app',
    'https://kurippu-510919.firebaseapp.com',
  ];

  /** Build the stable {source, type, version} payload the marketing page can trust. */
  function presencePayload() {
    let version = '';
    try { version = chrome.runtime.getManifest().version || ''; } catch (e) { /* ignore */ }
    return { source: 'kurippu-extension', type: 'extension-present', version };
  }

  /**
   * Tell allowlisted product origins that Kurippu is installed.
   * Posts once on load, and again when the page sends a same-origin ping
   * (so a late-loading site script can still learn status). Never includes notes.
   */
  function announcePresenceToSite() {
    if (DEMO) return;
    if (!SITE_ORIGINS.includes(location.origin)) return;
    const post = () => {
      try { window.postMessage(presencePayload(), location.origin); } catch (e) { /* ignore */ }
    };
    post();
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.source !== 'kurippu-extension' || data.type !== 'extension-present-ping') return;
      post();
    });
  }

  announcePresenceToSite();

  /* ── Data layer ──────────────────────────────────────────────────── */
  const db = DEMO ? demoDb() : chromeDb();

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
  function demoDb() {
    const notes = new Map();
    let settings = { ...K.DEFAULT_SETTINGS };
    return {
      forUrl: async (url) => [...notes.values()].filter((n) => n.url === url && !n.trashed),
      put: async (n) => { const v = { ...n, updated: Date.now() }; notes.set(n.id, v); return v; },
      trash: async (id) => { const n = notes.get(id); if (n) notes.set(id, { ...n, trashed: Date.now() }); },
      restore: async (id) => { const n = notes.get(id); if (n) notes.set(id, { ...n, trashed: null }); },
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

  /* ── State ───────────────────────────────────────────────────────── */
  let page = DEMO ? { url: 'kurippu/welcome', site: 'kurippu', path: '/welcome' } : K.pageKey(location.href);
  let settings = { ...K.DEFAULT_SETTINGS };
  const notes = new Map();      // id → note (this page only)
  const pos = new Map();        // id → {x, y, status: ok|lost|unplaced}
  const els = new Map();        // id → rendered element
  const sigs = new Map();       // id → render signature
  const anchorCache = new Map();// id → Element
  const z = new Map();
  let zTop = 10;
  let focusId = null, pulseId = null, placingId = null;
  let drag = null, lastCtx = null;
  const saveTimers = new Map();
  const pendingGroups = new Map();
  // One note's saves and deletes run in order, so a delete can't land before the save it follows.
  const writes = new Map();

  // How a note swings while carried and after it is let go. It is treated as a weight hanging from
  // the point it is held by: the weight trails the direction of travel, lags on a start, swings
  // forward on a stop and droops when held off-centre. Angles are in radians, distances in px.
  const HANG = 70, GYRATION = 40, GRAVITY = 900, DRAG = 3, INERTIA = 0.3;
  const ANG_K = 60, ANG_C = 4.6, MAX_ANG = 0.75;
  const SC_K = 300, SC_C = 14, LIFT_SCALE = 1.06;
  const stillMq = matchMedia('(prefers-reduced-motion: reduce)');
  const swings = new Map();     // id → swing state (see newSwing)
  const coasts = new Map();     // id → {x, y} of a thrown note still sliding after release
  const arrivals = new Set();   // ids that should pop in the next time they are drawn
  let held = null, swingRaf = 0, swingLast = 0;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const animating = () => settings.motion !== false && !stillMq.matches;
  const newSwing = () => ({ gx: 0, gy: 0, lx: 0, ly: 0, vx: 0, vy: 0, pvx: 0, pvy: 0, ang: 0, angV: 0, sc: 1, scV: 0 });

  // Advance a swing's angle and scale by `dt` seconds with two damped springs.
  // Returns true once the note has come to rest.
  function stepSwing(s, dt, isHeld) {
    const ax = clamp((s.vx - s.pvx) / dt, -20000, 20000);
    const ay = clamp((s.vy - s.pvy) / dt, -20000, 20000);
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
  }

  // Put the swing on the note through the stylesheet variables, or clear them when `s` is null.
  // The translate makes the rotation happen about the held point instead of the note's centre.
  function setSwing(el, s) {
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
  }

  // Start (or keep) swinging a note about the point (gx, gy) from its centre. Returns the swing
  // so callers can give it a push, or null when animations are off.
  function startSwing(id, gx, gy, lx, ly) {
    if (!animating()) return null;
    const s = Object.assign(swings.get(id) || newSwing(), { gx, gy, lx: lx || 0, ly: ly || 0 });
    swings.set(id, s);
    if (!swingRaf) { swingLast = performance.now(); swingRaf = requestAnimationFrame(tick); }
    return s;
  }

  // A new note arrives oversized and askew, and the springs bring it to rest.
  function popIn(id) {
    const s = startSwing(id, 0, 0);
    if (!s) return;
    s.sc = 1.3; s.ang = notes.size % 2 ? 0.2 : -0.2;
    setSwing(els.get(id), s);
  }

  // Landing squash on release, deeper the faster the note was moving.
  function release(s) {
    s.vx = clamp(s.vx, -1800, 1800);
    s.vy = clamp(s.vy, -1800, 1800);
    s.scV -= 0.5 + Math.hypot(s.vx, s.vy) * 0.0012;
  }

  // A thrown note has stopped sliding: pin it where it ended up.
  function endCoast(id) {
    const c = coasts.get(id);
    coasts.delete(id);
    if (c && notes.has(id)) drop(id, c.x, c.y);
  }

  function stopSwings() {
    for (const id of swings.keys()) setSwing(els.get(id), null);
    swings.clear();
    for (const id of [...coasts.keys()]) endCoast(id);
  }

  // One animation frame for every swinging note. A held note only has its speed measured here
  // (pointermove places it); a thrown one keeps sliding, slows down and bounces off the viewport sides.
  function tick(now) {
    const dt = Math.max(0.001, Math.min(0.032, (now - swingLast) / 1000));
    swingLast = now;
    swingRaf = 0;
    if (!animating()) { stopSwings(); return; }
    for (const [id, s] of swings) {
      const el = els.get(id);
      // A missing element is a rebuild in progress, unless the note is gone, unplaced, or the site is hidden.
      if (!notes.has(id) || (!el && (pos.get(id)?.status === 'unplaced' || settings.hidden[page.site]))) {
        swings.delete(id); endCoast(id); continue;
      }
      if (!el) continue;
      const isHeld = !!held && held.id === id;
      const c = coasts.get(id);
      if (isHeld) {
        s.vx += ((held.px - s.lx) / dt - s.vx) * 0.3;
        s.vy += ((held.py - s.ly) / dt - s.vy) * 0.3;
        s.lx = held.px; s.ly = held.py;
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
        if (c) endCoast(id);
      }
      const settled = stepSwing(s, dt, isHeld);
      if (settled && !coasts.has(id)) { swings.delete(id); setSwing(el, null); }
      else setSwing(el, s);
    }
    if (swings.size) swingRaf = requestAnimationFrame(tick);
  }

  // Take a note off the page with a short fade. It leaves `els` straight away, so layout and
  // render never touch it again while it fades.
  function leave(id) {
    const el = els.get(id);
    swings.delete(id); coasts.delete(id);
    if (!el) return;
    els.delete(id); sigs.delete(id);
    if (!animating()) { el.remove(); return; }
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }

  /* ── Shadow root host ────────────────────────────────────────────── */
  const host = document.createElement('kurippu-notes');
  host.setAttribute('style', 'all:initial;position:absolute;left:0;top:0;width:0;height:0;z-index:2147483600;display:block;pointer-events:none');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = K.NOTE_CSS + noteCss();
  shadow.appendChild(style);
  const layer = div('layer');
  const overlay = div('overlay');
  shadow.append(layer, overlay);

  function div(cls, html) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function mount() {
    if (!host.isConnected) (document.documentElement || document.body).appendChild(host);
  }

  /* ── Boot ────────────────────────────────────────────────────────── */
  async function init() {
    settings = await db.settings();
    await loadNotes();
    mount();
    bindEvents();
    schedule();
    // Late-loading pages: re-measure a few times while things settle.
    [300, 1000, 2500, 5000].forEach((t) => setTimeout(schedule, t));
    if (document.fonts) document.fonts.ready.then(schedule);
    window.addEventListener('load', schedule);
    if (!DEMO) {
      chrome.runtime.sendMessage({ type: 'content-ready' }).then((res) => {
        if (res && res.jump) setTimeout(() => jump(res.jump), 400);
      }).catch(() => {});
    }
  }

  async function loadNotes() {
    const list = await db.forUrl(page.url);
    notes.clear(); anchorCache.clear();
    list.forEach((n) => notes.set(n.id, n));
  }

  /* ── Anchoring ───────────────────────────────────────────────────────
     Each note stores an element anchor (CSS selector + text snippet +
     offset) and a fallback page coordinate. Restore tries them in order. */
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const TEXT_SEL = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,td,th,dt,dd,figcaption,img,label,summary,caption,code';
  const isOurs = (el) => el === host || (el && el.closest && el.closest('kurippu-notes'));

  // Text of an element with block boundaries kept as spaces, capped early so
  // it stays cheap on huge containers.
  function textOf(el, max) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let out = '';
    for (let t = w.nextNode(); t && out.length < max; t = w.nextNode()) {
      const v = t.nodeValue.trim();
      if (v && !(t.parentElement && /^(SCRIPT|STYLE|NOSCRIPT)$/.test(t.parentElement.tagName))) out += ' ' + v;
    }
    return norm(out);
  }
  function snippet(el) {
    if (el.tagName === 'IMG') return 'img:' + norm(el.alt || (el.currentSrc || el.src || '').split('/').pop()).slice(0, 80);
    return textOf(el, 120).slice(0, 80);
  }
  function anchorable(el) {
    if (!el || el.nodeType !== 1 || el === document.body || el === document.documentElement || isOurs(el)) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (r.height > Math.max(420, innerHeight * 0.6) || r.width * r.height > innerWidth * innerHeight * 0.45) return false;
    if (/^(IMG|VIDEO|CANVAS|PICTURE)$/.test(el.tagName)) return true;
    const t = textOf(el, 4001);
    return t.length >= 3 && t.length <= 4000;
  }
  function rectDist(r, x, y) {
    const cx = Math.max(r.left, Math.min(x, r.right)), cy = Math.max(r.top, Math.min(y, r.bottom));
    return Math.hypot(x - cx, y - cy);
  }
  // x, y are page coordinates.
  function findAnchor(x, y) {
    const cx = x - scrollX, cy = y - scrollY;
    let el = null;
    const hit = document.elementsFromPoint(cx, cy).find((e) => !isOurs(e));
    for (let e = hit, i = 0; e && i < 6; e = e.parentElement, i++) {
      if (anchorable(e)) { el = e; break; }
    }
    if (!el) {
      let best = null, bd = 260, ba = Infinity;
      document.querySelectorAll(TEXT_SEL).forEach((e) => {
        if (isOurs(e)) return;
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom < cy - 300 || r.top > cy + 300) return;
        const d = rectDist(r, cx, cy), a = r.width * r.height;
        if ((d < bd || (d === bd && a < ba)) && anchorable(e)) { bd = d; ba = a; best = e; }
      });
      el = best;
    }
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const text = snippet(el);
    return {
      el,
      anchor: { sel: selectorFor(el), tag: el.tagName, text, dx: Math.round(x - (r.left + scrollX)), dy: Math.round(y - (r.top + scrollY)) },
      label: labelOf(text),
    };
  }
  function labelOf(text) {
    const t = text.replace(/^img:/, '');
    if (!t) return '';
    return t.length > 26 ? t.slice(0, 24).trimEnd() + '…' : t;
  }
  const goodId = (id) => id && !/\d{3,}|^\d|[:[\]]|^(ember|react|radix|headlessui|mui)/i.test(id) && id.length < 50;
  function selectorFor(el) {
    const parts = [];
    for (let e = el; e && e !== document.body && e !== document.documentElement && parts.length < 14; e = e.parentElement) {
      if (goodId(e.id) && document.querySelectorAll('#' + CSS.escape(e.id)).length === 1) {
        parts.unshift('#' + CSS.escape(e.id));
        return parts.join(' > ');
      }
      let i = 1;
      for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName) i++;
      parts.unshift(e.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
    }
    return 'body > ' + parts.join(' > ');
  }
  function matchesText(el, text) {
    if (!text) return true;
    const s = snippet(el);
    const want = text.slice(0, 40);
    return s.startsWith(want) || (want.length > 12 && s.includes(want));
  }
  function visible(el) { const r = el.getBoundingClientRect(); return r.width > 0 || r.height > 0; }
  function resolveAnchor(n) {
    const a = n.anchor;
    if (!a) return null;
    const cached = anchorCache.get(n.id);
    if (cached && cached.isConnected && visible(cached) && matchesText(cached, a.text)) return cached;
    let el = null;
    try { el = document.querySelector(a.sel); } catch (e) { el = null; }
    if (!(el && visible(el) && matchesText(el, a.text))) {
      el = null;
      if (a.text) {
        const want = a.text.slice(0, 40);
        const pool = document.getElementsByTagName(a.tag || '*');
        for (let i = 0; i < pool.length && i < 20000; i++) {
          const c = pool[i];
          if (!isOurs(c) && snippet(c).startsWith(want) && visible(c)) { el = c; break; }
        }
      }
    }
    if (el) anchorCache.set(n.id, el); else anchorCache.delete(n.id);
    return el;
  }

  function docSize() {
    const d = document.documentElement, b = document.body || d;
    return { w: Math.max(d.scrollWidth, b.scrollWidth, innerWidth), h: Math.max(d.scrollHeight, b.scrollHeight, innerHeight) };
  }
  function computePos(n) {
    if (drag && drag.id === n.id) return { x: drag.x, y: drag.y, status: 'ok' };
    const c = coasts.get(n.id);
    if (c) return { x: c.x, y: c.y, status: 'ok' };
    const el = resolveAnchor(n);
    if (el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + scrollX + n.anchor.dx, y: r.top + scrollY + n.anchor.dy, status: 'ok' };
    }
    const { h } = docSize();
    if (n.x == null || n.y == null || n.y > h - 30) return { status: 'unplaced' };
    return { x: n.x, y: n.y, status: n.anchor ? 'lost' : 'ok' };
  }

  /* ── Layout & render ─────────────────────────────────────────────── */
  let raf = 0;
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); }

  let lastReport = '';
  function layout() {
    mount();
    const hidden = !!settings.hidden[page.site];
    // Clamp to the visible width so a note never widens the page.
    const vw = document.documentElement.clientWidth || innerWidth;
    for (const n of notes.values()) pos.set(n.id, computePos(n));
    for (const id of [...els.keys()]) if (!notes.has(id) || hidden) removeEl(id);
    if (!hidden) {
      for (const n of notes.values()) {
        const p = pos.get(n.id);
        if (p.status === 'unplaced') { removeEl(n.id); continue; }
        const el = render(n, p);
        const width = n.min && !inEdit(n) ? 26 : NOTE_W;
        const maxX = Math.max(scrollX, scrollX + vw - width - 8);
        el.style.left = Math.round(Math.max(0, Math.min(p.x, maxX))) + 'px';
        el.style.top = Math.round(Math.max(0, p.y)) + 'px';
        el.style.zIndex = String((z.get(n.id) || 1) + (inEdit(n) ? 100000 : 0));
        // After left/top, so a fresh note pops once it is actually on the page and a swing survives a rebuild.
        if (!swings.has(n.id) && arrivals.has(n.id)) { arrivals.delete(n.id); popIn(n.id); }
        if (swings.has(n.id)) setSwing(el, swings.get(n.id));
      }
    }
    report();
  }

  function report() {
    if (DEMO) return;
    const placed = [], lost = [], unplaced = [];
    for (const [id, p] of pos) {
      if (!notes.has(id)) continue;
      (p.status === 'unplaced' ? unplaced : p.status === 'lost' ? lost : placed).push(id);
    }
    const sig = JSON.stringify([page.url, placed.length + lost.length, unplaced, lost, !!settings.hidden[page.site]]);
    if (sig === lastReport) return;
    lastReport = sig;
    chrome.runtime.sendMessage({
      type: 'status', url: page.url, count: placed.length + lost.length, unplaced, lost, ok: placed,
      hidden: !!settings.hidden[page.site],
    }).catch(() => {});
  }

  function removeEl(id) {
    const el = els.get(id);
    if (el) el.remove();
    els.delete(id); sigs.delete(id);
    // The note is still here, so the next time it is drawn it should arrive again instead of popping in on a dead element.
    if (notes.has(id) && swings.has(id)) arrivals.add(id);
  }

  // Saved edit mode only. Notes from before this field existed have none, and stay in preview.
  function inEdit(n) {
    return !!(n && n.mode === 'edit');
  }

  function render(n, p) {
    const editing = inEdit(n);
    const min = !!n.min && !editing;
    const lost = p.status === 'lost';
    const sig = JSON.stringify([editing, min, n.color, lost, editing ? '' : n.text, n.label, pulseId === n.id]);
    let el = els.get(n.id);
    if (el && sigs.get(n.id) === sig) return el;
    const pal = K.palette(n.color);
    const fresh = !el;
    if (fresh) { el = document.createElement('div'); el.dataset.id = n.id; layer.appendChild(el); els.set(n.id, el); bindNote(el, n.id); }
    sigs.set(n.id, sig);
    el.style.setProperty('--k-fill', pal.fill);
    el.style.setProperty('--k-band', pal.band);
    el.style.setProperty('--k-code', pal.code);
    el.className = ['note', min ? 'mini' : '', editing ? 'editing' : '', lost ? 'lost' : '', pulseId === n.id ? 'pulse' : ''].filter(Boolean).join(' ');

    if (min) {
      // data-drag makes the chip move like the band; a tap with no movement still expands (see startDrag).
      el.innerHTML = `<button class="mini-btn" data-drag data-act="expand" title="${K.esc(K.firstLine(n.text))}" aria-label="Expand note"></button>`;
      return el;
    }
    const lostBlock = lost ? `
      <div class="lost-box">
        <div class="lost-msg">${K.icon('alert', 13)}<span>Couldn’t find “${K.esc(n.label || 'its anchor')}”. Showing it where you left it.</span></div>
        <div class="lost-actions" data-nodrag><button data-act="repin">Pin to nearby text</button><button data-act="keep">Keep here</button></div>
      </div>` : '';

    // Both modes share one band: the Edit / Preview toggle, a spacer, then delete.
    const band = `
      <div class="band" data-drag>
        <div class="seg" data-nodrag role="group" aria-label="Mode"><button aria-pressed="${editing}" data-act="edit">Edit</button><button aria-pressed="${!editing}" data-act="preview">Preview</button></div>
        <span class="flex"></span>
        <button class="ib" data-nodrag data-act="min" title="Minimise note" aria-label="Minimise note">${K.icon('minus')}</button>
        <button class="ib" data-nodrag data-act="del" title="Delete note" aria-label="Delete note">${K.icon('trash')}</button>
      </div>`;

    if (editing) {
      const swatches = K.COLORS.map((c) => {
        const sp = K.palette(c);
        return `<button class="sw${sp.bordered ? ' bordered' : ''}" data-act="color" data-color="${c}" role="radio" aria-checked="${c === n.color}" title="${c}" style="background:${sp.swatch}"></button>`;
      }).join('');
      const prevTa = el.querySelector('textarea');
      const caret = prevTa && shadow.activeElement === prevTa ? [prevTa.selectionStart, prevTa.selectionEnd] : null;
      el.innerHTML = `${band}
        <textarea data-nodrag placeholder="Write in Markdown…" spellcheck="true" aria-label="Note text (Markdown)"></textarea>
        <div class="foot" data-nodrag role="radiogroup" aria-label="Color">${swatches}<span class="keys" title="${K.modLabel}+Enter to preview">${K.modLabel} + Enter</span></div>
        ${lostBlock}`;
      const ta = el.querySelector('textarea');
      ta.value = n.text;
      fitRows(ta);
      if (focusId === n.id || caret) {
        ta.focus({ preventScroll: true });
        if (focusId === n.id) ta.setSelectionRange(ta.value.length, ta.value.length);
        else ta.setSelectionRange(caret[0], caret[1]);
        if (focusId === n.id) focusId = null;
      }
      return el;
    }
    el.innerHTML = `${band}
      <div class="body k-md">${K.md(n.text)}</div>
      ${lostBlock}`;
    return el;
  }

  // Grow the text box one row per line of text, with room for one more and never fewer than four.
  function fitRows(ta) {
    ta.rows = Math.max(4, ta.value.split('\n').length + 1);
  }

  /* ── Note interactions ───────────────────────────────────────────── */
  function bindNote(el, id) {
    // Keep the page's own keyboard shortcuts away from our text box.
    ['keydown', 'keyup', 'keypress', 'input', 'beforeinput', 'paste', 'copy', 'cut'].forEach((t) =>
      el.addEventListener(t, (e) => e.stopPropagation()));
    el.addEventListener('contextmenu', (e) => { e.stopPropagation(); });
    el.addEventListener('pointerdown', (e) => {
      front(id);
      const band = e.target.closest('[data-drag]');
      if (band && !e.target.closest('[data-nodrag]') && e.button === 0) startDrag(id, e);
      e.stopPropagation();
    });
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const box = e.target.closest('[data-line]');
      if (box) { const n = notes.get(id); if (n) update(id, { text: K.toggleCheck(n.text, +box.dataset.line) }, true); return; }
      const btn = e.target.closest('[data-act]');
      if (btn) act(id, btn.dataset.act, btn);
    });
    el.addEventListener('dblclick', (e) => {
      if (!inEdit(notes.get(id)) && e.target.closest('.body') && !e.target.closest('a,[data-line]')) { e.stopPropagation(); startEdit(id); }
    });
    el.addEventListener('keydown', (e) => {
      const box = e.target.closest && e.target.closest('[data-line]');
      if (box && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); box.click(); return; }
      if (e.target.tagName !== 'TEXTAREA') return;
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); showPreview(id); }
    });
    el.addEventListener('input', (e) => {
      if (e.target.tagName !== 'TEXTAREA') return;
      fitRows(e.target);
      update(id, { text: e.target.value });
    });
  }

  function act(id, a, btn) {
    const n = notes.get(id);
    if (!n) return;
    switch (a) {
      case 'edit': startEdit(id); break;
      case 'preview': showPreview(id); break;
      // A minimised note can't stay in edit mode (render ignores `min` while editing), so it drops to preview.
      case 'min': update(id, { min: true, mode: 'preview' }, true); break;
      case 'expand': update(id, { min: false }, true); break;
      case 'del': del(id); break;
      case 'color':
        update(id, { color: btn.dataset.color }, true);
        settings.lastColor = btn.dataset.color;
        db.patchSettings({ lastColor: btn.dataset.color });
        break;
      case 'repin': repin(id); break;
      case 'keep': {
        const p = pos.get(id);
        update(id, { anchor: null, label: '', x: Math.round(p.x), y: Math.round(p.y) }, true);
        break;
      }
    }
    schedule();
  }

  function front(id) {
    if (z.get(id) === zTop) return;
    z.set(id, ++zTop);
    const el = els.get(id);
    if (el) el.style.zIndex = String(zTop + (inEdit(notes.get(id)) ? 100000 : 0));
  }

  // Run `fn` after this note's previous write. A failed write does not block the next one.
  function afterWrite(id, fn) {
    const prev = writes.get(id) || Promise.resolve();
    const next = prev.then(fn, fn);
    writes.set(id, next.then(() => {}, () => {}));
    return next;
  }

  // Store whatever the note says right now, including a blank. Skips the write if it was deleted first.
  function persist(id) {
    return afterWrite(id, () => {
      const n = notes.get(id);
      if (!n) return null;
      const groups = [...(pendingGroups.get(id) || [])];
      pendingGroups.delete(id);
      return db.put(n, groups).then((stored) => {
        const current = notes.get(id);
        if (stored && current && stored.text === current.text) notes.set(id, { ...current, _sync: stored._sync });
        return stored;
      });
    });
  }

  function update(id, patch, immediate) {
    const n = notes.get(id);
    if (!n) return;
    notes.set(id, { ...n, ...patch, updated: Date.now() });
    const groups = pendingGroups.get(id) || new Set();
    K.groupsForKeys(Object.keys(patch)).forEach((group) => groups.add(group));
    pendingGroups.set(id, groups);
    clearTimeout(saveTimers.get(id));
    const save = () => {
      saveTimers.delete(id);
      persist(id);
    };
    if (immediate) save();
    else saveTimers.set(id, setTimeout(save, 450));
    if (patch.text == null || !inEdit(notes.get(id))) schedule();
  }
  function flush(id) {
    if (!saveTimers.has(id)) return;
    clearTimeout(saveTimers.get(id)); saveTimers.delete(id);
    persist(id);
  }
  // Open one note for writing and remember it. Other notes keep the mode they already had.
  function startEdit(id) {
    const n = notes.get(id);
    if (!n) return;
    focusId = id;
    front(id);
    if (inEdit(n) && !n.min) {
      const ta = els.get(id) && els.get(id).querySelector('textarea');
      if (ta) { ta.focus({ preventScroll: true }); focusId = null; }
      return;
    }
    update(id, n.min ? { mode: 'edit', min: false } : { mode: 'edit' }, true);
  }
  // Save preview for this note only. A blank note stays, the same way the site keeps one.
  function showPreview(id) {
    const n = notes.get(id);
    if (!n || !inEdit(n)) return;
    if (focusId === id) focusId = null;
    update(id, { mode: 'preview' }, true);
  }
  function del(id) {
    if (focusId === id) focusId = null;
    clearTimeout(saveTimers.get(id)); saveTimers.delete(id);
    pendingGroups.delete(id);
    leave(id);
    notes.delete(id);
    afterWrite(id, () => db.trash(id));
    schedule();
  }

  function createAt(x, y) {
    if (settings.hidden[page.site]) return;
    x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
    const found = findAnchor(x, y);
    const id = K.newId();
    const n = {
      id, url: page.url, site: page.site, path: page.path, scheme: DEMO ? 'https:' : location.protocol,
      title: DEMO ? 'Welcome' : document.title.slice(0, 120),
      color: settings.lastColor || 'amber', text: '', mode: 'edit', created: Date.now(), updated: Date.now(),
      x, y, anchor: found ? found.anchor : null, label: found ? found.label : '',
    };
    notes.set(id, n); arrivals.add(id);
    focusId = id;
    front(id);
    update(id, {}, true);
  }

  function placeAt(id, x, y) {
    x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
    const found = findAnchor(x + 16, y + 16);
    if (found) found.anchor.dx -= 16, found.anchor.dy -= 16;
    anchorCache.delete(id);
    update(id, { x, y, anchor: found ? found.anchor : null, label: found ? found.label : '' }, true);
  }
  function repin(id) {
    const p = pos.get(id);
    if (!p || p.x == null) return;
    const found = findAnchor(p.x + 16, p.y + 16);
    if (found) placeAt(id, p.x, p.y);
    else update(id, { anchor: null, label: '', x: Math.round(p.x), y: Math.round(p.y) }, true);
  }

  // Pin a note at page position (x, y) after a drag, and save that spot.
  function drop(id, x, y) {
    placeAt(id, x, y);
  }

  function startDrag(id, e) {
    let p = pos.get(id);
    // Grabbing a note that is still sliding from a throw catches it where it is.
    const c = coasts.get(id);
    if (c) { coasts.delete(id); p = { x: c.x, y: c.y }; }
    if (!p || p.x == null) return;
    e.preventDefault();
    const d = { id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, x: p.x, y: p.y, moved: false };
    const el0 = els.get(id);
    if (el0) {
      // The held point, measured from the note's centre, is the pivot it swings about.
      const r = el0.getBoundingClientRect();
      held = { id, px: e.clientX, py: e.clientY };
      startSwing(id, e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), e.clientX, e.clientY);
    }
    const move = (ev) => {
      if (held && held.id === id) { held.px = ev.clientX; held.py = ev.clientY; }
      if (Math.abs(ev.clientX - d.sx) + Math.abs(ev.clientY - d.sy) > 3) d.moved = true;
      if (!d.moved) return;
      drag = d;
      d.x = Math.max(0, d.ox + ev.clientX - d.sx); d.y = Math.max(0, d.oy + ev.clientY - d.sy);
      const el = els.get(id);
      if (el) { el.style.left = d.x + 'px'; el.style.top = d.y + 'px'; el.classList.add('dragging'); }
    };
    // On release a moving note is thrown: it keeps sliding in the swing loop and is only
    // pinned once it stops (see endCoast). Without animations it is pinned straight away.
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      drag = null;
      if (held && held.id === id) held = null;
      const el = els.get(id);
      if (el) el.classList.remove('dragging');
      const s = swings.get(id);
      if (s) release(s);
      if (d.moved && s && Math.abs(s.vx) + Math.abs(s.vy) > 3) coasts.set(id, { x: d.x, y: d.y });
      else if (d.moved) drop(id, d.x, d.y);
      else {
        schedule();
        // preventDefault on pointerdown swallows the chip's click, so a tap opens it here instead.
        const chip = e.target.closest && e.target.closest('[data-act="expand"]');
        if (chip) act(id, 'expand', chip);
      }
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }

  function jump(id) {
    const n = notes.get(id);
    const p = n && pos.get(id);
    if (!p || p.x == null) return;
    if (n.min) update(id, { min: false }, true);
    window.scrollTo({ top: Math.max(0, p.y - 160), left: Math.max(0, p.x - innerWidth + 340), behavior: 'smooth' });
    front(id);
    pulseId = id; schedule();
    setTimeout(() => { if (pulseId === id) { pulseId = null; schedule(); } }, 1500);
  }

  function startPlacing(id) {
    placingId = id;
    overlay.innerHTML = `<div class="placing">${K.icon('crosshair', 14)}Click where this note belongs · Esc to cancel</div>`;
    overlay.classList.add('on');
  }
  function stopPlacing() { placingId = null; overlay.classList.remove('on'); overlay.innerHTML = ''; }
  overlay.addEventListener('click', (e) => {
    if (!placingId) return;
    e.stopPropagation();
    const id = placingId;
    stopPlacing();
    const x = e.clientX + scrollX, y = e.clientY + scrollY;
    placeAt(id, x, y);
    front(id);
    setTimeout(() => jump(id), 50);
  });

  /* ── Hints ───────────────────────────────────────────────────────── */
  let hintEl = null;
  function showSiteMenuHint() {
    if (hintEl || settings.hintsSeen[page.site]) return;
    hintEl = div('hint');
    hintEl.innerHTML = `<span class="hint-ic">${K.icon('note', 13, 2.2)}</span><span class="hint-txt">This page has its own right-click menu. <b>${K.modLabel} + click</b> any empty spot to add a note instead.</span><button>Got it</button>`;
    hintEl.querySelector('button').addEventListener('click', () => {
      hintEl.remove(); hintEl = null;
      settings.hintsSeen = { ...settings.hintsSeen, [page.site]: true };
      db.patchSettings({ hintsSeen: settings.hintsSeen });
    });
    shadow.appendChild(hintEl);
  }

  /* ── Page events ─────────────────────────────────────────────────── */
  const INTERACTIVE = 'a[href],button,input,textarea,select,label,summary,option,video,audio,iframe,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="link"],[role="textbox"],[role="menuitem"],[role="tab"],[role="checkbox"]';
  const modDown = (e) => (K.isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey;

  function bindEvents() {
    // Remember where the last right-click happened, for the context menu item.
    window.addEventListener('contextmenu', (e) => {
      if (e.composedPath().includes(host)) return;
      lastCtx = { x: e.pageX, y: e.pageY };
    }, true);
    // If the page handled right-click itself, we step aside and point at the shortcut.
    window.addEventListener('contextmenu', (e) => {
      if (e.composedPath().includes(host)) return;
      setTimeout(() => {
        const t = e.target instanceof Element ? e.target : null;
        if (e.defaultPrevented && !(t && t.closest('input,textarea,[contenteditable]'))) showSiteMenuHint();
      }, 0);
    }, false);

    // Ctrl/⌘ + click on empty space adds a note. Links etc. behave as normal.
    window.addEventListener('click', (e) => {
      if (e.button !== 0 || !modDown(e) || e.composedPath().includes(host)) return;
      const t = e.target;
      if (!(t instanceof Element) || t.closest(INTERACTIVE)) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      createAt(e.pageX, e.pageY);
    }, true);

    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (placingId) { stopPlacing(); e.stopPropagation(); }
    }, true);

    window.addEventListener('resize', schedule);
    // Anchored notes follow elements inside scrolling containers too.
    document.addEventListener('scroll', (e) => { if (e.target !== document) schedule(); }, { capture: true, passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
    let mt = 0;
    new MutationObserver((muts) => {
      if (muts.every((m) => isOurs(m.target))) return;
      if (mt) return;
      mt = setTimeout(() => { mt = 0; schedule(); }, 400);
    }).observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });

    // Single-page apps change the URL without reloading.
    if (!DEMO) {
      let href = location.href;
      setInterval(() => {
        if (location.href === href) return;
        href = location.href;
        const next = K.pageKey(href);
        if (!next || next.url === page.url) return;
        for (const id of saveTimers.keys()) flush(id);
        page = next;
        lastReport = '';
        loadNotes().then(schedule);
      }, 700);
    }

    db.onChange(onStorage);
    chrome.runtime.onMessage.addListener(onMessage);
  }

  function onStorage(changes) {
    let dirty = false;
    for (const key in changes) {
      if (key === K.SETTINGS_KEY) {
        settings = { ...K.DEFAULT_SETTINGS, ...(changes[key].newValue || {}) };
        dirty = true;
        continue;
      }
      if (!K.isNoteKey(key)) continue;
      const n = changes[key].newValue;
      const id = key.slice(K.NOTE_PREFIX.length);
      if (!n || n.purged || n.trashed) {
        if (notes.has(id)) { leave(id); notes.delete(id); if (focusId === id) focusId = null; dirty = true; }
        continue;
      }
      if (n.url !== page.url) {
        if (notes.has(id)) { leave(id); notes.delete(id); dirty = true; }
        continue;
      }
      const cur = notes.get(id);
      if (cur && K.canonical(K.normalizeNote(cur)) === K.canonical(K.normalizeNote(n))) continue;
      const ta = els.get(id) && els.get(id).querySelector('textarea');
      if (ta && shadow.activeElement === ta) continue;
      notes.set(id, n); anchorCache.delete(id); dirty = true;
      if (inEdit(n) && ta && ta.value !== n.text) { ta.value = n.text; fitRows(ta); }
    }
    if (dirty) schedule();
  }

  function onMessage(msg, sender, reply) {
    if (!msg || typeof msg !== 'object') return;
    if (DEMO && msg.target !== 'welcome') return;
    switch (msg.type) {
      case 'add-at-context': {
        const p = lastCtx || { x: scrollX + innerWidth / 2 - 132, y: scrollY + innerHeight / 3 };
        createAt(p.x, p.y);
        break;
      }
      case 'new-note':
        createAt(scrollX + innerWidth / 2 - NOTE_W / 2, scrollY + innerHeight / 3);
        break;
      case 'jump': jump(msg.id); break;
      case 'place': startPlacing(msg.id); break;
      case 'get-status': {
        layout();
        const out = { url: page.url, ok: [], lost: [], unplaced: [] };
        for (const [id, p] of pos) if (notes.has(id)) out[p.status === 'unplaced' ? 'unplaced' : p.status === 'lost' ? 'lost' : 'ok'].push(id);
        reply(out);
        return;
      }
    }
  }

  /* ── Fonts ───────────────────────────────────────────────────────────
     Loaded from the extension as ArrayBuffers under private family names,
     so page CSP never blocks them and they can't clash with the page. */
  function loadFonts() {
    if (!document.fonts || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) return;
    const faces = [
      ['Kurippu Lora', 'lora-latin-400-normal', '400', 'normal'],
      ['Kurippu Lora', 'lora-latin-400-italic', '400', 'italic'],
      ['Kurippu Lora', 'lora-latin-600-normal', '600', 'normal'],
      ['Kurippu Lora', 'lora-latin-600-italic', '600', 'italic'],
      ['Kurippu Cormorant', 'cormorant-garamond-latin-600-normal', '600', 'normal'],
    ];
    faces.forEach(([family, file, weight, st]) => {
      fetch(chrome.runtime.getURL('assets/fonts/' + file + '.woff2'))
        .then((r) => r.arrayBuffer())
        .then((buf) => new FontFace(family, buf, { weight, style: st }).load())
        .then((f) => { document.fonts.add(f); schedule(); })
        .catch(() => {});
    });
  }

  loadFonts();
  if (page) init();

  /* ── Styles (note look 1a - tinted paper) ────────────────────────── */
  function noteCss() {
    return `
:host{all:initial}
*{box-sizing:border-box}
.layer{position:absolute;left:0;top:0;width:0;height:0;--k-body:"Kurippu Lora","Lora",Georgia,serif;--k-heading:"Kurippu Cormorant","Cormorant Garamond",Georgia,serif;
  --shadow-sm:0 1px 2px color-mix(in srgb,#2d2b2b 14%,transparent);--shadow-md:0 3px 10px color-mix(in srgb,#2d2b2b 16%,transparent);--shadow-lg:0 12px 32px color-mix(in srgb,#2d2b2b 22%,transparent)}
button{font:inherit;color:inherit}
button:focus{outline:none}
button:focus-visible{outline:2px solid #b68235;outline-offset:2px}
.note{position:absolute;width:${NOTE_W}px;background:var(--k-fill);box-shadow:var(--shadow-md);border-radius:2px;font:13px/1.5 var(--k-body);color:#201f1d;text-align:left;
  outline:2px solid transparent;outline-offset:3px;transition:outline-color .4s,box-shadow .2s;pointer-events:auto;cursor:default;letter-spacing:normal;text-transform:none;direction:ltr;
  transform:translate(var(--tx,0px),var(--ty,0px)) rotate(var(--swing,0deg)) scale(var(--sc,1))}
.note.dragging{box-shadow:var(--shadow-lg)}
.note.leaving{animation:k-note-out .12s ease-in forwards;pointer-events:none}
@keyframes k-note-out{to{opacity:0}}
@media (prefers-reduced-motion:reduce){.note.leaving{animation:none}}
.note.lost{outline:1.5px dashed #7d5411}
.note.pulse{outline:2px solid #b68235}
.note.mini{width:26px;height:26px;background:var(--k-fill);border-top:5px solid var(--k-band);box-shadow:var(--shadow-sm);cursor:grab}
.note.mini.dragging{cursor:grabbing;box-shadow:var(--shadow-lg)}
.mini-btn{position:absolute;left:0;top:-5px;width:26px;height:26px;display:block;border:0;background:transparent;cursor:inherit;padding:0;border-radius:2px;touch-action:none}
.band{height:30px;background:var(--k-band);display:flex;align-items:center;gap:2px;padding:0 4px 0 6px;color:#444141;cursor:grab;touch-action:none;user-select:none;border-radius:2px 2px 0 0}
.dragging .band{cursor:grabbing}
.flex{flex:1;align-self:stretch}
.ib{width:24px;height:24px;display:grid;place-items:center;border:0;background:transparent;border-radius:3px;cursor:pointer;padding:0;color:#444141}
.ib:hover{background:color-mix(in srgb,#201f1d 10%,transparent)}
.seg{display:flex;border:1px solid color-mix(in srgb,#201f1d 25%,transparent);border-radius:3px;overflow:hidden}
.seg button{padding:4px 9px;border:0;background:transparent;font:11px/1 var(--k-body);color:#201f1d;cursor:pointer}
.seg button[aria-pressed="true"]{box-shadow:inset 0 0 0 1px #7d5411}
.body{padding:12px 16px 14px;gap:5px;min-height:40px;user-select:text}
textarea{display:block;width:100%;border:0;outline:0;resize:none;background:transparent;padding:12px 14px;margin:0;font:12px/1.65 ui-monospace,Menlo,Consolas,monospace;color:#2d2b2b;caret-color:#7d5411;box-shadow:none}
textarea::placeholder{color:#7d7979}
.foot{display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid color-mix(in srgb,#201f1d 12%,transparent)}
.sw{width:16px;height:16px;border-radius:50%;border:0;padding:0;cursor:pointer;flex:none}
.sw.bordered{border:1px solid #bab6b6}
.sw:hover{transform:scale(1.1)}
.sw[aria-checked="true"]{box-shadow:0 0 0 2px var(--k-fill),0 0 0 3.5px #201f1d}
.keys{margin-left:auto;font-size:11px;color:#605d5d}
.lost-box{display:flex;flex-direction:column;gap:8px;padding:10px 14px 12px;border-top:1px solid color-mix(in srgb,#201f1d 14%,transparent);font-size:12px;line-height:1.45;color:#2d2b2b}
.lost-msg{display:flex;gap:8px}
.lost-msg svg{flex:none;margin-top:2px}
.lost-actions{display:flex;gap:16px}
.lost-actions button,.hint button{border:0;background:transparent;padding:2px 4px;margin:-2px -4px;border-radius:3px;font:600 13px/1.2 var(--k-heading);color:#5a3b0a;cursor:pointer}
.lost-actions button:hover,.hint button:hover{background:color-mix(in srgb,#b68235 12%,transparent)}
.overlay{position:fixed;inset:0;display:none;cursor:crosshair;pointer-events:auto;z-index:3}
.overlay.on{display:block}
.placing,.hint{position:fixed;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;padding:10px 14px;background:#f3f2f2;border:1px solid color-mix(in srgb,#201f1d 16%,transparent);border-radius:4px;box-shadow:var(--shadow-md);font:13px/1.4 "Kurippu Lora","Lora",Georgia,serif;color:#201f1d;pointer-events:auto;z-index:4;max-width:calc(100vw - 40px)}
.placing{top:14px;border-color:#b68235;pointer-events:none;color:#201f1d}
.placing svg{color:#7d5411}
.hint{bottom:24px;width:min(520px,calc(100vw - 40px));align-items:flex-start;line-height:1.45}
.hint b{font-weight:600;white-space:nowrap}
.hint-ic{flex:none;width:22px;height:22px;border-radius:3px;background:oklch(0.89 0.065 85);display:grid;place-items:center;color:#2d2b2b}
.hint-txt{flex:1}
.hint button{margin:0;padding:2px 6px;font-size:14px;color:#7d5411;flex:none}
`;
  }
})();
