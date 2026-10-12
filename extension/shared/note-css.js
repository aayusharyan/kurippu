/* Shared CSS for rendered Markdown inside notes and options cards.
   Injected into the content-script shadow root and options page so a note
   looks the same in both places. */
(function (root) {
  'use strict';

  const B = root.__KurippuBuilder;

  B.NOTE_CSS = `
.k-md{display:flex;flex-direction:column;gap:4px;font:13px/1.5 var(--k-body);color:#201f1d;overflow-wrap:anywhere;text-align:left}
.k-md b{font-weight:600}
.k-md a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.k-md code{font:12px ui-monospace,Menlo,Consolas,monospace;background:var(--k-code,rgba(32,31,29,.07));padding:1px 4px;border-radius:2px}
.k-md .k-h{font:600 17px/1.2 var(--k-heading);margin-top:2px}
.k-md .k-li{display:flex;gap:8px}
.k-md .k-num{font-feature-settings:'tnum'}
.k-md .k-box{flex:none;width:12px;height:12px;margin-top:4px;box-sizing:border-box;border:1.3px solid currentColor;border-radius:2px;display:grid;place-items:center;cursor:pointer}
.k-md .k-box:focus-visible{outline:2px solid #b68235;outline-offset:2px}
.k-md .k-done{text-decoration:line-through;opacity:.6}
.k-md .k-quote{font-style:italic;opacity:.85;padding-left:10px;border-left:2px solid rgba(32,31,29,.2)}
.k-md .k-tag{font-size:11px;padding:1px 6px;border-radius:3px;background:rgba(32,31,29,.08)}
.k-md .k-gap{height:4px}
.k-md .k-rule{height:1px;background:rgba(32,31,29,.18);margin:4px 0}
.k-md .k-empty{opacity:.55;font-style:italic}
`;
})(typeof self !== 'undefined' ? self : this);
