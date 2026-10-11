/* Element anchoring and fallback page coordinates for note placement.
   Builds selector-plus-snippet anchors and resolves them back on the page. */
(function (root) {
  'use strict';

  if (root.__KurippuSkipContent) return;
  const E = root.__KurippuEngine;
  if (!E) return;

  const TEXT_SEL = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,td,th,dt,dd,figcaption,img,label,summary,caption,code';

  /** Collapse whitespace in a string for stable text comparisons. */
  E.norm = function norm(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  };

  /** Whether a node is our host or lives inside it. */
  E.isOurs = function isOurs(el) {
    return el === E.host || (el && el.closest && el.closest('kurippu-notes'));
  };

  // Text of an element with block boundaries kept as spaces, capped early so
  // it stays cheap on huge containers.
  /** Collect visible text from an element, capped at max characters. */
  E.textOf = function textOf(el, max) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let out = '';
    for (let t = w.nextNode(); t && out.length < max; t = w.nextNode()) {
      const v = t.nodeValue.trim();
      if (v && !(t.parentElement && /^(SCRIPT|STYLE|NOSCRIPT)$/.test(t.parentElement.tagName))) out += ' ' + v;
    }
    return E.norm(out);
  };

  /** Short text or image label used to match an anchor later. */
  E.snippet = function snippet(el) {
    if (el.tagName === 'IMG') return 'img:' + E.norm(el.alt || (el.currentSrc || el.src || '').split('/').pop()).slice(0, 80);
    return E.textOf(el, 120).slice(0, 80);
  };

  /** Whether an element is a reasonable place to hang a note. */
  E.anchorable = function anchorable(el) {
    if (!el || el.nodeType !== 1 || el === document.body || el === document.documentElement || E.isOurs(el)) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (r.height > Math.max(420, innerHeight * 0.6) || r.width * r.height > innerWidth * innerHeight * 0.45) return false;
    if (/^(IMG|VIDEO|CANVAS|PICTURE)$/.test(el.tagName)) return true;
    const t = E.textOf(el, 4001);
    return t.length >= 3 && t.length <= 4000;
  };

  /** Distance from a point to the nearest edge of a client rect. */
  E.rectDist = function rectDist(r, x, y) {
    const cx = Math.max(r.left, Math.min(x, r.right)), cy = Math.max(r.top, Math.min(y, r.bottom));
    return Math.hypot(x - cx, y - cy);
  };

  // x, y are page coordinates.
  /** Find the best anchor element near page coordinates x, y. */
  E.findAnchor = function findAnchor(x, y) {
    const cx = x - scrollX, cy = y - scrollY;
    let el = null;
    const hit = document.elementsFromPoint(cx, cy).find((e) => !E.isOurs(e));
    for (let e = hit, i = 0; e && i < 6; e = e.parentElement, i++) {
      if (E.anchorable(e)) { el = e; break; }
    }
    if (!el) {
      let best = null, bestDistance = 260, bestArea = Infinity;
      document.querySelectorAll(TEXT_SEL).forEach((e) => {
        if (E.isOurs(e)) return;
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom < cy - 300 || r.top > cy + 300) return;
        const distance = E.rectDist(r, cx, cy), area = r.width * r.height;
        if ((distance < bestDistance || (distance === bestDistance && area < bestArea)) && E.anchorable(e)) {
          bestDistance = distance;
          bestArea = area;
          best = e;
        }
      });
      el = best;
    }
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const text = E.snippet(el);
    return {
      el,
      anchor: { sel: E.selectorFor(el), tag: el.tagName, text, dx: Math.round(x - (r.left + scrollX)), dy: Math.round(y - (r.top + scrollY)) },
      label: E.labelOf(text),
    };
  };

  /** Shorten an anchor text into a label shown in the lost-note warning. */
  E.labelOf = function labelOf(text) {
    const t = text.replace(/^img:/, '');
    if (!t) return '';
    return t.length > 26 ? t.slice(0, 24).trimEnd() + '…' : t;
  };

  /** Whether an id attribute is stable enough to use in a selector. */
  E.goodId = function goodId(id) {
    return id && !/\d{3,}|^\d|[:[\]]|^(ember|react|radix|headlessui|mui)/i.test(id) && id.length < 50;
  };

  /** Build a CSS selector path for an element, preferring a unique id. */
  E.selectorFor = function selectorFor(el) {
    const parts = [];
    for (let e = el; e && e !== document.body && e !== document.documentElement && parts.length < 14; e = e.parentElement) {
      if (E.goodId(e.id) && document.querySelectorAll('#' + CSS.escape(e.id)).length === 1) {
        parts.unshift('#' + CSS.escape(e.id));
        return parts.join(' > ');
      }
      let i = 1;
      for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName) i++;
      parts.unshift(e.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
    }
    return 'body > ' + parts.join(' > ');
  };

  /** Whether an element's snippet still matches the saved anchor text. */
  E.matchesText = function matchesText(el, text) {
    if (!text) return true;
    const s = E.snippet(el);
    const want = text.slice(0, 40);
    return s.startsWith(want) || (want.length > 12 && s.includes(want));
  };

  /** Whether an element currently has a non-zero layout box. */
  E.visible = function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };

  /** Resolve a note's saved anchor to a live element, using the cache when valid. */
  E.resolveAnchor = function resolveAnchor(n) {
    const a = n.anchor;
    if (!a) return null;
    const cached = E.anchorCache.get(n.id);
    if (cached && cached.isConnected && E.visible(cached) && E.matchesText(cached, a.text)) return cached;
    let el = null;
    try { el = document.querySelector(a.sel); } catch (e) { el = null; }
    if (!(el && E.visible(el) && E.matchesText(el, a.text))) {
      el = null;
      if (a.text) {
        const want = a.text.slice(0, 40);
        const pool = document.getElementsByTagName(a.tag || '*');
        for (let i = 0; i < pool.length && i < 20000; i++) {
          const c = pool[i];
          if (!E.isOurs(c) && E.snippet(c).startsWith(want) && E.visible(c)) { el = c; break; }
        }
      }
    }
    if (el) E.anchorCache.set(n.id, el); else E.anchorCache.delete(n.id);
    return el;
  };

  /** Document scroll size used when checking fallback coordinates. */
  E.docSize = function docSize() {
    const d = document.documentElement, b = document.body || d;
    return { w: Math.max(d.scrollWidth, b.scrollWidth, innerWidth), h: Math.max(d.scrollHeight, b.scrollHeight, innerHeight) };
  };

  /** Compute page position and status (ok, lost, or unplaced) for a note. */
  E.computePos = function computePos(n) {
    if (E.drag && E.drag.id === n.id) return { x: E.drag.x, y: E.drag.y, status: 'ok' };
    const c = E.coasts.get(n.id);
    if (c) return { x: c.x, y: c.y, status: 'ok' };
    const el = E.resolveAnchor(n);
    if (el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + scrollX + n.anchor.dx, y: r.top + scrollY + n.anchor.dy, status: 'ok' };
    }
    const { h } = E.docSize();
    if (n.x == null || n.y == null || n.y > h - 30) return { status: 'unplaced' };
    return { x: n.x, y: n.y, status: n.anchor ? 'lost' : 'ok' };
  };
})(typeof self !== 'undefined' ? self : this);
