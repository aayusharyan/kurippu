/* Note card UI for the options page.
   Builds a card element and handles task toggles, links, trash actions, and open-note. */

import { K, esc, pageState } from './state.js';

/** Flip a task checkbox on a card without opening the note. Returns whether the click was that checkbox. */
async function handleTaskToggle(event, note, opts) {
  const box = event.target.closest('[data-line]');
  if (!box) return false;
  event.stopPropagation();
  if (!opts.trash) await K.store.put({ ...note, text: K.toggleCheck(note.text, +box.dataset.line) });
  return true;
}

/** Let a link inside a card navigate. Returns whether the click was that link. */
function handleCardLink(event) {
  if (!event.target.closest('a')) return false;
  event.stopPropagation();
  return true;
}

/** Trash, restore, or delete forever from the card buttons. Returns whether a button was clicked. */
async function handleCardAction(event, note) {
  const action = event.target.closest('[data-act]');
  if (!action) return false;
  event.stopPropagation();
  if (action.dataset.act === 'del') await K.store.trash(note.id);
  if (action.dataset.act === 'restore') await K.store.restore(note.id);
  if (action.dataset.act === 'purge') await K.store.purge(note.id);
  return true;
}

/** Open the note on its page. Trash cards do not open. */
function openNoteFromCard(note, opts) {
  if (opts.trash) return;
  chrome.runtime.sendMessage({ type: 'open-note', id: note.id });
}

/** Route a card click to task toggle, link, action button, or open-note. */
async function onCard(event, note, opts) {
  if (await handleTaskToggle(event, note, opts)) return;
  if (handleCardLink(event)) return;
  if (await handleCardAction(event, note)) return;
  openNoteFromCard(note, opts);
}

/** Build a focusable note card with preview, footer actions, and click handlers. */
export function cardEl(n, opts) {
  opts = opts || {};
  const pal = K.palette(n.color);
  const el = document.createElement('div');
  el.className = 'card' + (!opts.trash && pageState.placement[n.id] === 'unplaced' ? ' unplaced' : '');
  el.tabIndex = 0;
  el.setAttribute('role', 'link');
  el.style.setProperty('--k-fill', pal.fill);
  el.style.setProperty('--k-band', pal.band);
  el.style.setProperty('--k-code', pal.code);
  const where = opts.where || n.path || '/';
  const placed = pageState.placement[n.id] === 'unplaced' ? ' · not placed' : '';
  el.innerHTML = `<div class="card-band"></div><div class="card-body k-md">${K.md(n.text)}</div>
    <div class="card-foot"><span class="where" title="${esc(n.site + n.path)}">${esc(where)}${placed}</span>` +
    (opts.trash
      ? `<span>${esc(K.ago(n.trashed))}</span><button class="txt" data-act="restore">Restore</button><button class="ib" data-act="purge" title="Delete forever" aria-label="Delete forever">${K.icon('trash', 12)}</button>`
      : `<span>${esc(K.ago(n.created))}</span><button class="ib" data-act="del" title="Delete" aria-label="Delete">${K.icon('trash', 12)}</button>`) +
    '</div>';
  el.setAttribute('aria-label', K.firstLine(n.text) + ' - ' + n.site + n.path);
  el.addEventListener('click', (e) => onCard(e, n, opts));
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); onCard(e, n, opts); } });
  return el;
}
