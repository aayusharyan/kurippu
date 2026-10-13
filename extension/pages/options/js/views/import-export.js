/* Import and export view: download portable JSON and merge notes by ID. */

import { K, esc, pageState, query, main } from '../state.js';

/** Download all notes as a kurippu-notes.json file. */
export function exportJson() {
  const data = { format: 'kurippu-export', version: 1, exported: new Date().toISOString(), notes: pageState.notes.map(K.portable) };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'kurippu-notes.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Parse a chosen JSON file and add notes whose IDs are not already stored. */
async function importJson(e) {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    const arr = Array.isArray(j) ? j : j && j.notes;
    if (!Array.isArray(arr)) throw new Error('shape');
    const have = new Set((await K.store.allRaw()).map((n) => n.id));
    const add = arr.filter((n) => K.validNote(n) && !n.purged && !have.has(n.id)).map((n) => ({
      ...n, color: K.COLORS.includes(n.color) ? n.color : 'amber', site: n.site || String(n.url).split('/')[0],
      path: n.path || '/' + String(n.url).split('/').slice(1).join('/'), created: +n.created || Date.now(), updated: +n.updated || Date.now(),
    }));
    await K.store.putMany(add);
    pageState.importMsg = `Imported ${K.plural(add.length, 'note')} · ${arr.length - add.length} already here.`;
  } catch (err) {
    pageState.importMsg = 'That file isn’t a Kurippu export.';
  }
  renderIO();
}

/** Render the Import & export sections and wire download / file-input handlers. */
export function renderIO() {
  main.dataset.view = 'io';
  main.innerHTML = `<div class="view narrow">
    <h1 class="view-title">Import &amp; export</h1>
    <div class="section"><div class="section-label"><h2 class="section-title">Export</h2></div>
      <div class="section-body"><p class="prose">All ${K.plural(pageState.notes.length, 'note')} as plain, unencrypted JSON - positions, anchors, colors and text.</p>
        <button class="btn btn-primary" id="exp">${K.icon('upload', 14)}Download kurippu-notes.json</button></div></div>
    <div class="rule"></div>
    <div class="section"><div class="section-label"><h2 class="section-title">Import</h2></div>
      <div class="section-body"><p class="prose">Merges by note ID - existing notes are kept, never overwritten.</p>
        <label class="btn">${K.icon('download', 14)}Choose a JSON file…<input type="file" id="imp" accept=".json,application/json" hidden></label>
        ${pageState.importMsg ? `<div class="msg">${esc(pageState.importMsg)}</div>` : ''}</div></div>
  </div>`;
  query('#exp').onclick = exportJson;
  query('#imp').onchange = importJson;
}
