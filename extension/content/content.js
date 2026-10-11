/* Final bootstrap for the in-page note engine classic-script chain.
   Loads notes, mounts the host, binds events, and starts layout once
   every feature file has registered on the private engine object. */
(function (root) {
  'use strict';

  if (root.__KurippuSkipContent) return;
  const E = root.__KurippuEngine;
  if (!E || !E.db || !E.bindEvents || !E.loadFonts) {
    throw new Error('Content features missing: load feature scripts before content.js');
  }

  /** Fetch this page's notes into the in-memory map. */
  E.loadNotes = async function loadNotes() {
    const list = await E.db.forUrl(E.page.url);
    E.notes.clear(); E.anchorCache.clear();
    list.forEach((n) => E.notes.set(n.id, n));
  };

  /** Load settings and notes, mount UI, bind listeners, and schedule layout. */
  E.init = async function init() {
    E.settings = await E.db.settings();
    await E.loadNotes();
    E.mount();
    E.bindEvents();
    E.schedule();
    // Late-loading pages: re-measure a few times while things settle.
    [300, 1000, 2500, 5000].forEach((t) => setTimeout(E.schedule, t));
    if (document.fonts) document.fonts.ready.then(E.schedule);
    window.addEventListener('load', E.schedule);
    if (!E.DEMO) {
      chrome.runtime.sendMessage({ type: 'content-ready' }).then((res) => {
        if (res && res.jump) setTimeout(() => E.jump(res.jump), 400);
      }).catch(() => {});
    }
  };

  E.loadFonts();
  if (E.page) E.init();

  delete root.__KurippuEngine;
})(typeof self !== 'undefined' ? self : this);
