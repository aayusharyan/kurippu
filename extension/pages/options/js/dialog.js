/* Modal dialog helper for the options page.
   Builds a backdrop, focuses the primary button, and closes on Escape or outside click. */

import { query } from './state.js';

/** Show a modal and let the caller attach its buttons. Escape and a click outside both close it. */
export function openDialog(html, bindDialogEvents) {
  const back = document.createElement('div');
  back.className = 'backdrop';
  back.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dt">${html}</div>`;
  const prev = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  query('#layer').appendChild(back);
  bindDialogEvents(back.querySelector('.dialog'), close);
  const primary = back.querySelector('.btn-primary');
  if (primary) primary.focus();
}
