/* Trash view: trashed notes with restore, purge, and empty-trash actions. */

import { K, pageState, query, main } from '../state.js';
import { cardEl } from '../card.js';

/** Show trashed notes as cards and wire Empty trash when the list is non-empty. */
export function renderTrash() {
  main.dataset.view = 'trash';
  main.innerHTML = `<div class="view">
    <div class="view-head"><h1 class="view-title">Trash</h1>${pageState.trash.length ? `<button class="btn" id="empty" style="margin-left:auto">${K.icon('trash', 14)}Empty trash</button>` : ''}</div>
    <div class="note-small">Deleted notes wait here until you empty the trash. Deleting forever removes them on your other devices too.</div>
    <div class="rule"></div>
    ${pageState.trash.length ? '<div class="cards"></div>' : '<div class="empty-state">Trash is empty.</div>'}</div>`;
  const cards = query('.cards');
  pageState.trash.forEach((n) => cards.appendChild(cardEl(n, { trash: true, where: n.site + n.path })));
  const b = query('#empty');
  if (b) b.onclick = async () => {
    for (const x of pageState.trash) await K.store.purge(x.id);
  };
}
