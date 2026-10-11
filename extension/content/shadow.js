/* Closed shadow host, note layer, placing overlay, and note stylesheet.
   Isolates note UI from the host page's CSS and CSP. */
(function (root) {
  'use strict';

  if (root.__KurippuSkipContent) return;
  const E = root.__KurippuEngine;
  if (!E) return;
  const K = E.K;

  /** Create a div with optional class and HTML content. */
  E.div = function div(cls, html) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  };

  /** Styles for the note chrome and overlay (tinted paper look). */
  E.noteCss = function noteCss() {
    return `
:host{all:initial}
*{box-sizing:border-box}
.layer{position:absolute;left:0;top:0;width:0;height:0;--k-body:"Kurippu Lora","Lora",Georgia,serif;--k-heading:"Kurippu Cormorant","Cormorant Garamond",Georgia,serif;
  --shadow-sm:0 1px 2px color-mix(in srgb,#2d2b2b 14%,transparent);--shadow-md:0 3px 10px color-mix(in srgb,#2d2b2b 16%,transparent);--shadow-lg:0 12px 32px color-mix(in srgb,#2d2b2b 22%,transparent)}
button{font:inherit;color:inherit}
button:focus{outline:none}
button:focus-visible{outline:2px solid #b68235;outline-offset:2px}
.note{position:absolute;width:${E.NOTE_W}px;background:var(--k-fill);box-shadow:var(--shadow-md);border-radius:2px;font:13px/1.5 var(--k-body);color:#201f1d;text-align:left;
  outline:2px solid transparent;outline-offset:3px;transition:outline-color .4s,box-shadow .2s;pointer-events:auto;cursor:default;letter-spacing:normal;text-transform:none;direction:ltr;
  transform:translate(var(--tx,0px),var(--ty,0px)) rotate(var(--swing,0deg)) scale(var(--sc,1))}
.note.dragging{box-shadow:var(--shadow-lg)}
.note.leaving{animation:k-note-out .12s ease-in forwards;pointer-events:none}
@keyframes k-note-out{to{opacity:0}}
@media (prefers-reduced-motion:reduce){.note.leaving,.note.mini.chip-in{animation:none}}
.note.lost{outline:1.5px dashed #7d5411}
.note.pulse{outline:2px solid #b68235}
.note.mini{width:26px;height:26px;background:var(--k-fill);border-top:5px solid var(--k-band);box-shadow:var(--shadow-sm);cursor:grab}
.note.mini.dragging{cursor:grabbing;box-shadow:var(--shadow-lg)}
.note.mini.chip-in{animation:k-chip-in .34s cubic-bezier(.2,.9,.3,1.25)}
@keyframes k-chip-in{from{opacity:0;transform:translateY(-14px) scale(1.3) rotate(-12deg)}}
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
.lost-actions button{border:0;background:transparent;padding:2px 4px;margin:-2px -4px;border-radius:3px;font:600 13px/1.2 var(--k-heading);color:#5a3b0a;cursor:pointer}
.lost-actions button:hover{background:color-mix(in srgb,#b68235 12%,transparent)}
.overlay{position:fixed;inset:0;display:none;cursor:crosshair;pointer-events:auto;z-index:3}
.overlay.on{display:block}
.placing{position:fixed;left:50%;top:14px;transform:translateX(-50%);display:flex;align-items:center;gap:12px;padding:10px 14px;background:#f3f2f2;border:1px solid #b68235;border-radius:4px;box-shadow:var(--shadow-md);font:13px/1.4 "Kurippu Lora","Lora",Georgia,serif;color:#201f1d;pointer-events:none;z-index:4;max-width:calc(100vw - 40px)}
.placing svg{color:#7d5411}
`;
  };

  E.host = document.createElement('kurippu-notes');
  E.host.setAttribute('style', 'all:initial;position:absolute;left:0;top:0;width:0;height:0;z-index:2147483600;display:block;pointer-events:none');
  E.shadow = E.host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = K.NOTE_CSS + E.noteCss();
  E.shadow.appendChild(style);
  E.layer = E.div('layer');
  E.overlay = E.div('overlay');
  E.shadow.append(E.layer, E.overlay);

  /** Attach the host to the document if it is not already mounted. */
  E.mount = function mount() {
    if (!E.host.isConnected) (document.documentElement || document.body).appendChild(E.host);
  };
})(typeof self !== 'undefined' ? self : this);
