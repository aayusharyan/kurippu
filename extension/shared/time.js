/* Relative and absolute time formatting helpers for UI labels.
   Depends on DAY from the constants script on the shared builder. */
(function (root) {
  'use strict';

  const B = root.__KurippuBuilder;

  /** Human-readable relative time such as "3 min ago" or "yesterday". */
  B.ago = function ago(ts) {
    const d = Date.now() - ts;
    if (d < 6e4) return 'just now';
    if (d < 36e5) return Math.round(d / 6e4) + ' min ago';
    if (d < B.DAY) return Math.round(d / 36e5) + ' h ago';
    if (d < 2 * B.DAY) return 'yesterday';
    if (d < 7 * B.DAY) return Math.round(d / B.DAY) + ' days ago';
    if (d < 30 * B.DAY) { const w = Math.round(d / 7 / B.DAY); return w + (w === 1 ? ' week ago' : ' weeks ago'); }
    const mo = Math.round(d / 30 / B.DAY); return mo + (mo === 1 ? ' month ago' : ' months ago');
  };

  /** Compact relative age for tight list rows (m, h, d, w, mo). */
  B.short = function short(ts) {
    const d = Date.now() - ts;
    if (d < 36e5) return Math.max(1, Math.round(d / 6e4)) + 'm';
    if (d < B.DAY) return Math.round(d / 36e5) + 'h';
    if (d < 7 * B.DAY) return Math.round(d / B.DAY) + 'd';
    if (d < 30 * B.DAY) return Math.round(d / 7 / B.DAY) + 'w';
    return Math.round(d / 30 / B.DAY) + 'mo';
  };

  /** Absolute local date/time label, using "Today" when appropriate. */
  B.fmt = function fmt(ts) {
    const d = new Date(ts), n = new Date();
    const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === n.toDateString()) return `Today, ${hm}`;
    const y = d.getFullYear() !== n.getFullYear() ? ' ' + d.getFullYear() : '';
    return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}${y}, ${hm}`;
  };

  /** Coarse bucket label for grouping notes by recency. */
  B.bucket = function bucket(ts) {
    const d = Date.now() - ts;
    return d < B.DAY ? 'Today' : d < 7 * B.DAY ? 'This week' : d < 30 * B.DAY ? 'This month' : 'Earlier';
  };

  /** Format a count with a singular or plural noun. */
  B.plural = function plural(n, one, many) {
    return `${n} ${n === 1 ? one : (many || one + 's')}`;
  };
})(typeof self !== 'undefined' ? self : this);
