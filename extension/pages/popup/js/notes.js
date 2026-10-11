/* Note list for the active page: placed notes, unplaced notes, hide toggle, and new note. */

import { byId } from './dom.js';

/** Show the active page and wire its note list. Restricted pages never call this. */
export async function showPageNotes(K, tab, page) {
  /** Route an action through the service worker to the active tab. */
  const relayToContentScript = (message) => chrome.runtime.sendMessage({ type: 'to-tab', tabId: tab.id, msg: message });
  let settings = await K.store.settings();
  const notes = (await K.store.forUrl(page.url)).sort((a, b) => b.created - a.created);
  let status = null;
  try { status = await chrome.tabs.sendMessage(tab.id, { type: 'get-status' }); } catch (e) { status = null; }

  byId('can').hidden = false;
  byId('host').textContent = page.site === 'file' ? 'Local file' : page.site;
  byId('path').textContent = page.path || '/';

  /** Render placed and unplaced notes for the active page. */
  function renderNotes() {
    const hidden = !!settings.hidden[page.site];
    byId('show').setAttribute('aria-checked', String(!hidden));
    byId('new').disabled = hidden;
    byId('new').title = hidden ? 'Notes are hidden on this site' : 'Adds a note in the middle of the page';

    const unplacedIds = new Set(status ? status.unplaced : []);
    const placed = notes.filter((n) => !unplacedIds.has(n.id));
    const unplaced = notes.filter((n) => unplacedIds.has(n.id));

    byId('placedHead').textContent = `On this page · ${placed.length}`;
    const list = byId('placed');
    list.textContent = '';
    if (!placed.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = `No notes here yet. Right-click the page, or ${K.modLabel} + click any empty spot.`;
      list.appendChild(e);
    }
    placed.forEach((n) => {
      const b = document.createElement('button');
      b.className = 'row' + (hidden ? ' dim' : '');
      b.innerHTML = `<span class="dot" style="background:${K.palette(n.color).swatch}"></span><span class="row-title"></span><span class="row-ago">${K.short(n.created)}</span>`;
      b.querySelector('.row-title').textContent = K.firstLine(n.text);
      b.title = 'Scroll to this note';
      b.onclick = () => { if (!hidden) { relayToContentScript({ type: 'jump', id: n.id }); window.close(); } };
      list.appendChild(b);
    });

    byId('unplacedWrap').hidden = !unplaced.length;
    byId('unplacedHead').textContent = `Couldn’t place · ${unplaced.length}`;
    const ul = byId('unplaced');
    ul.textContent = '';
    unplaced.forEach((n) => {
      const r = document.createElement('div');
      r.className = 'row static';
      r.innerHTML = `<span class="dot" style="background:${K.palette(n.color).swatch}"></span><span class="row-title"></span><button class="link-btn">Place</button>`;
      r.querySelector('.row-title').textContent = K.firstLine(n.text);
      r.querySelector('button').onclick = () => { relayToContentScript({ type: 'place', id: n.id }); window.close(); };
      ul.appendChild(r);
    });
  }

  renderNotes();
  byId('show').onclick = async () => {
    const hidden = { ...settings.hidden };
    if (hidden[page.site]) delete hidden[page.site]; else hidden[page.site] = true;
    settings = await K.store.patchSettings({ hidden });
    renderNotes();
  };
  byId('new').onclick = () => { relayToContentScript({ type: 'new-note' }); window.close(); };
}
