/* Small Markdown renderer for note preview text.
   Supports headings, emphasis, code, links, lists, quotes, and #tags.
   Output is escaped HTML attached to the shared builder. */
(function (root) {
  'use strict';

  const B = root.__KurippuBuilder;

  /** Escape characters that would break HTML text content. */
  B.esc = function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  /** Apply inline Markdown markers after HTML-escaping the source string. */
  B.inline = function inline(s) {
    s = B.esc(s);
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    s = s.replace(/(^|\s)#([a-z0-9][\w-]*)/gi, '$1<span class="k-tag">#$2</span>');
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[+i]}</code>`);
    return s;
  };

  const CHECK_SVG = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  /** Render a full note body to HTML block markup for preview. */
  B.md = function md(text) {
    if (!text || !text.trim()) return '<div class="k-empty">Empty note - click Edit.</div>';
    return text.split('\n').map((l, i) => {
      let m;
      if ((m = l.match(/^#{1,3}\s+(.*)/))) return `<div class="k-h">${B.inline(m[1])}</div>`;
      if ((m = l.match(/^\s*[-*+]\s+\[( |x)\]\s*(.*)/i))) {
        const on = m[1].toLowerCase() === 'x';
        return `<div class="k-li"><span class="k-box" data-line="${i}" role="checkbox" aria-checked="${on}" tabindex="0">${on ? CHECK_SVG : ''}</span><span class="${on ? 'k-done' : ''}">${B.inline(m[2])}</span></div>`;
      }
      if ((m = l.match(/^\s*[-*+]\s+(.*)/))) return `<div class="k-li"><span>–</span><span>${B.inline(m[1])}</span></div>`;
      if ((m = l.match(/^\s*(\d+)[.)]\s+(.*)/))) return `<div class="k-li"><span class="k-num">${m[1]}.</span><span>${B.inline(m[2])}</span></div>`;
      if ((m = l.match(/^>\s?(.*)/))) return `<div class="k-quote">${B.inline(m[1])}</div>`;
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) return '<div class="k-rule"></div>';
      if (!l.trim()) return '<div class="k-gap"></div>';
      return `<div>${B.inline(l)}</div>`;
    }).join('');
  };

  /** Flip the task checkbox on one Markdown line and return the new text. */
  B.toggleCheck = function toggleCheck(text, lineIndex) {
    const lines = text.split('\n');
    if (lines[lineIndex] == null) return text;
    lines[lineIndex] = lines[lineIndex].replace(/\[( |x)\]/i, (m) => (/x/i.test(m) ? '[ ]' : '[x]'));
    return lines.join('\n');
  };

  /** Collect unique lowercase #tags from note text. */
  B.tagsOf = function tagsOf(t) {
    return [...String(t || '').matchAll(/(^|\s)#([a-z0-9][\w-]*)/gi)]
      .map((m) => m[2].toLowerCase())
      .filter((v, i, a) => a.indexOf(v) === i);
  };

  /** First non-empty line with list/heading markers stripped, for titles. */
  B.firstLine = function firstLine(t) {
    const l = (String(t || '').split('\n').find((x) => x.trim()) || '');
    return l.replace(/^\s*(#{1,3}\s+|[-*+]\s+(\[[ x]\]\s*)?|\d+[.)]\s+|>\s?)/i, '').replace(/[*`_~]/g, '').trim() || 'Empty note';
  };
})(typeof self !== 'undefined' ? self : this);
