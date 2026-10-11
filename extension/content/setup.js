/* Guard, product-origin presence, and shared engine state.
   First content classic script: sets __kurippuLoaded, clears orphan hosts,
   and creates the private engine object later files register on.
   Presence is a public postMessage API on allowlisted product origins only;
   keep source/type strings stable (see README → Product-site presence). */
(function (root) {
  'use strict';

  // Same-world reinjection must not rebuild; later scripts in this batch no-op via the skip flag.
  if (root.__kurippuLoaded) {
    root.__KurippuSkipContent = true;
    return;
  }
  root.__KurippuSkipContent = false;
  root.__kurippuLoaded = true;
  // A previous copy may have left its host behind when the extension reloaded. Drop it before building a new one.
  document.querySelectorAll('kurippu-notes').forEach((el) => el.remove());

  const E = root.__KurippuEngine = {};
  E.K = root.Kurippu;
  E.DEMO = !!root.KURIPPU_DEMO;
  E.NOTE_W = 232;

  // Product site hosts that may listen for a presence signal. Never localhost or Astro dev.
  E.SITE_ORIGINS = [
    'https://kurippu.yush.dev',
    'https://kurippu-510919.web.app',
    'https://kurippu-510919.firebaseapp.com',
  ];

  /** Build { source, type, version } only. Never notes, counts, URLs, sync, or Drive. */
  E.presencePayload = function presencePayload() {
    let version = '';
    try { version = chrome.runtime.getManifest().version || ''; } catch (e) { /* ignore */ }
    return { source: 'kurippu-extension', type: 'extension-present', version };
  };

  /**
   * Tell allowlisted product origins that the extension is installed.
   * Posts once on load, and again on a same-window, same-origin ping
   * ({ source, type: 'extension-present-ping' }) so a late site script still hears it.
   * In-tab only: no cookies, no remote call. Skipped in the welcome-page demo.
   */
  E.announcePresenceToSite = function announcePresenceToSite() {
    if (E.DEMO) return;
    if (!E.SITE_ORIGINS.includes(location.origin)) return;
    const post = () => {
      try { root.postMessage(E.presencePayload(), location.origin); } catch (e) { /* ignore */ }
    };
    post();
    root.addEventListener('message', (event) => {
      if (event.source !== root || event.origin !== location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.source !== 'kurippu-extension' || data.type !== 'extension-present-ping') return;
      post();
    });
  };

  E.announcePresenceToSite();

  E.page = E.DEMO ? { url: 'kurippu/welcome', site: 'kurippu', path: '/welcome' } : E.K.pageKey(location.href);
  E.settings = { ...E.K.DEFAULT_SETTINGS };
  E.notes = new Map();
  E.positionsById = new Map();
  E.noteElementsById = new Map();
  E.renderSignatureById = new Map();
  E.anchorCache = new Map();
  E.zIndexById = new Map();
  E.zTop = 10;
  E.focusId = null;
  E.pulseId = null;
  E.placingId = null;
  E.drag = null;
  E.lastCtx = null;
  E.saveTimers = new Map();
  E.pendingGroups = new Map();
  // One note's saves and deletes run in order, so a delete can't land before the save it follows.
  E.writes = new Map();

  E.swings = new Map();
  E.coasts = new Map();
  E.arrivals = new Set();
  // Notes to spring open on the next layout, after they leave a chip. Cleared as each one is drawn.
  E.chipOpens = new Set();
  E.held = null;
  E.swingRaf = 0;
  E.swingLast = 0;
  E.stillMq = matchMedia('(prefers-reduced-motion: reduce)');
  E.raf = 0;
  E.lastReport = '';

  /** Clamp a number into an inclusive [lo, hi] range. */
  E.clamp = function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  };
})(typeof self !== 'undefined' ? self : this);
