/* Colors, platform detection, and page URL helpers.
   Loads first among the shared classic scripts and creates the internal
   builder object that later files extend before assembly. */
(function (root) {
  'use strict';

  const B = root.__KurippuBuilder = root.__KurippuBuilder || {};

  B.DAY = 864e5;

  /* Note look 1a "Tinted paper": the whole note takes the color, a darker
     band is the drag handle. Hues are OKLCH so every color has equal weight. */
  B.HUES = { amber: 85, sage: 145, sky: 235, rose: 20, lilac: 305, paper: null };
  B.COLORS = Object.keys(B.HUES);

  /** Build fill, band, code, and swatch tones for a named note color. */
  B.palette = function palette(color) {
    const h = B.HUES[color];
    if (h == null) {
      return {
        fill: 'oklch(0.965 0.006 85)', band: 'oklch(0.92 0.008 85)',
        code: 'oklch(0.9 0.008 85)', swatch: 'oklch(0.95 0.006 85)', bordered: true,
      };
    }
    return {
      fill: `oklch(0.93 0.05 ${h})`, band: `oklch(0.89 0.065 ${h})`,
      code: `oklch(0.87 0.06 ${h})`, swatch: `oklch(0.82 0.09 ${h})`, bordered: false,
    };
  };

  const platform = (typeof navigator !== 'undefined' &&
    ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform)) || '';
  B.isMac = /mac|iphone|ipad/i.test(platform);
  B.modLabel = B.isMac ? '⌘' : 'Ctrl';

  /* A page is identified by host + path + query (minus tracking params);
     the fragment is ignored so in-page anchors share notes. */
  /** Return a portable page key, site host, and path for a href, or null. */
  B.pageKey = function pageKey(href) {
    let u;
    try { u = new URL(href); } catch (e) { return null; }
    if (!/^(https?|file):$/.test(u.protocol)) return null;
    [...u.searchParams.keys()].forEach((k) => {
      if (/^(utm_|fbclid$|gclid$|mc_eid$|ref_src$)/i.test(k)) u.searchParams.delete(k);
    });
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    const search = u.searchParams.toString();
    const host = u.protocol === 'file:' ? 'file' : u.host;
    return { url: host + path + (search ? '?' + search : ''), site: host, path: path + (search ? '?' + search : '') };
  };

  /** Whether notes are allowed on this href. */
  B.canNote = function canNote(href) { return !!B.pageKey(href); };

  /** Rebuild a navigable href from a stored note's site and path fields. */
  B.hrefFor = function hrefFor(note) {
    if (note.site === 'file') return 'file://' + note.path;
    return (note.scheme || 'https:') + '//' + note.url;
  };
})(typeof self !== 'undefined' ? self : this);
