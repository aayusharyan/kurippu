/* Load bundled note fonts as FontFace ArrayBuffers under private family names.
   Avoids page CSP blocks and clashes with the host page's own fonts. */
(function (root) {
  'use strict';

  if (root.__KurippuSkipContent) return;
  const E = root.__KurippuEngine;
  if (!E) return;

  /** Fetch woff2 fonts from the extension and register them on document.fonts. */
  E.loadFonts = function loadFonts() {
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
        .then((f) => { document.fonts.add(f); E.schedule(); })
        .catch(() => {});
    });
  };
})(typeof self !== 'undefined' ? self : this);
