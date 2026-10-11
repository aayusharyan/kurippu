/* All-notes view: search, color/tag/site filters, grouping, and card results. */

import { K, esc, pageState, query, main } from '../state.js';
import { cardEl } from '../card.js';
import { exportJson } from './import-export.js';

/** Notes matching the current search query and active filters, newest first. */
function filtered() {
  const q = pageState.searchQuery.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  return pageState.notes.filter((n) => {
    if (pageState.colorFilter && n.color !== pageState.colorFilter) return false;
    if (pageState.tagFilter && !K.tagsOf(n.text).includes(pageState.tagFilter)) return false;
    if (pageState.siteFilter && n.site !== pageState.siteFilter) return false;
    if (pageState.unplacedOnly && pageState.placement[n.id] !== 'unplaced') return false;
    if (!words.length) return true;
    const hay = (n.text + ' ' + n.site + n.path + ' ' + (n.title || '')).toLowerCase();
    return words.every((w) => hay.includes(w));
  }).sort((a, b) => b.created - a.created);
}

/** Draw group-by, color swatches, active filter chips, and result counts. */
function renderFilters() {
  const f = query('#filters');
  if (!f) return;
  const list = filtered();
  const seg = `<div class="seg" role="group" aria-label="Group by">
    <button data-g="site" aria-pressed="${pageState.group === 'site'}">By site</button><button data-g="time" aria-pressed="${pageState.group === 'time'}">Timeline</button></div>`;
  const colors = `<div class="colors"><span>Color</span>${K.COLORS.map((c) => {
    const p = K.palette(c);
    return `<button class="swatch${p.bordered ? ' bordered' : ''}" data-c="${c}" title="${c}" aria-label="${c}" aria-pressed="${pageState.colorFilter === c}" style="background:${p.swatch}"></button>`;
  }).join('')}</div>`;
  const chips = [
    pageState.tagFilter ? `<button class="chip" data-clear="tag">#${esc(pageState.tagFilter)}${K.icon('x', 12)}</button>` : '',
    pageState.siteFilter ? `<button class="chip" data-clear="site">${esc(pageState.siteFilter)}${K.icon('x', 12)}</button>` : '',
  ].join('');
  const sites = new Set(list.map((n) => n.site)).size;
  f.innerHTML = seg + colors + chips + `<span class="result-meta">${K.plural(list.length, 'note')} · ${K.plural(sites, 'site')}</span>`;
  f.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => {
    pageState.group = b.dataset.g;
    try { localStorage.setItem('kurippu.group', pageState.group); } catch (e) { /* ignore */ }
    renderFilters(); renderResults();
  });
  f.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { pageState.colorFilter = pageState.colorFilter === b.dataset.c ? null : b.dataset.c; renderFilters(); renderResults(); });
  f.querySelectorAll('[data-clear]').forEach((b) => b.onclick = () => { location.hash = ''; });
}

/** Fill the results area with grouped cards or an empty-state message. */
function renderResults() {
  const out = query('#results');
  if (!out) return;
  const list = filtered();
  out.textContent = '';
  if (!list.length) {
    const e = document.createElement('div');
    e.className = 'empty-state';
    e.textContent = !pageState.notes.length
      ? `No notes yet. Right-click any page and choose “Add sticky note here”, or ${K.modLabel} + click an empty spot.`
      : pageState.unplacedOnly && !pageState.searchQuery && !pageState.colorFilter ? 'Every note found its place the last time its page was open.'
        : 'No notes match. Try fewer words, or clear the color and tag filters.';
    out.appendChild(e);
    return;
  }
  const groups = new Map();
  list.forEach((n) => {
    const k = pageState.group === 'site' ? n.site : K.bucket(n.created);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(n);
  });
  for (const [title, ns] of groups) {
    const g = document.createElement('section');
    g.className = 'group';
    const pages = new Set(ns.map((x) => x.path)).size;
    const meta = pageState.group === 'site' ? `${K.plural(ns.length, 'note')} · ${K.plural(pages, 'page')}` : K.plural(ns.length, 'note');
    g.innerHTML = `<div class="group-head"><h2 class="group-title">${esc(title === 'file' ? 'Local files' : title)}</h2><span class="group-meta">${meta}</span>${
      pageState.group === 'site' && title !== 'file' ? '<button class="link-btn">Open site</button>' : ''}</div><div class="cards"></div>`;
    const ob = g.querySelector('.link-btn');
    if (ob) ob.onclick = () => chrome.tabs.create({ url: (ns[0].scheme || 'https:') + '//' + title });
    const cards = g.querySelector('.cards');
    ns.forEach((n) => cards.appendChild(cardEl(n, { where: pageState.group === 'site' ? n.path || '/' : n.site + n.path })));
    out.appendChild(g);
  }
}

/** Mount or refresh the All notes / Couldn’t place view shell, filters, and results. */
export function renderAll() {
  if (main.dataset.view !== 'all') {
    main.dataset.view = 'all';
    main.innerHTML = `<div class="view">
      <div class="view-head">
        <h1 class="view-title" id="allTitle">All notes</h1>
        <label class="search">${K.icon('search', 15)}<input id="q" type="search" placeholder="Search notes, sites, tags" aria-label="Search notes"></label>
        <button class="btn" id="exp">${K.icon('upload', 14)}Export</button>
      </div>
      <div class="filters" id="filters"></div>
      <div class="rule"></div>
      <div id="results"></div>
    </div>`;
    const q = query('#q');
    q.value = pageState.searchQuery;
    q.addEventListener('input', () => { pageState.searchQuery = q.value; renderResults(); renderFilters(); });
    query('#exp').onclick = exportJson;
  }
  query('#allTitle').textContent = pageState.unplacedOnly ? 'Couldn’t place' : 'All notes';
  renderFilters();
  renderResults();
}
