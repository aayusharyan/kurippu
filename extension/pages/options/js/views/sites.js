/* Sites view: list of hosts with note counts, colors, and open-site actions. */

import { K, esc, pageState, query, main } from '../state.js';

/** List sites that have notes, sorted by count, with links into the filtered All notes view. */
export function renderSites() {
  main.dataset.view = 'sites';
  const by = new Map();
  pageState.notes.forEach((n) => { if (!by.has(n.site)) by.set(n.site, []); by.get(n.site).push(n); });
  const rows = [...by.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  main.innerHTML = `<div class="view narrow"><h1 class="view-title">Sites</h1>${rows.length ? '<div class="site-rows"></div>' : '<div class="empty-state">No sites yet.</div>'}</div>`;
  const wrap = query('.site-rows');
  rows.forEach(([site, ns]) => {
    const last = Math.max(...ns.map((n) => n.updated || n.created));
    const pages = new Set(ns.map((n) => n.path)).size;
    const hidden = !!pageState.settings.hidden[site];
    const r = document.createElement('div');
    r.className = 'site-row';
    const dots = [...new Set(ns.map((n) => n.color))].map((c) => `<span class="dot" style="background:${K.palette(c).swatch}"></span>`).join('');
    r.innerHTML = `<button class="name">${esc(site === 'file' ? 'Local files' : site)}</button>
      <span class="dots">${dots}</span>
      <span class="meta">${K.plural(ns.length, 'note')} · ${K.plural(pages, 'page')} · ${esc(K.ago(last))}${hidden ? ' · hidden' : ''}</span>
      ${site === 'file' ? '<span></span>' : '<button class="link-btn">Open site</button>'}`;
    r.querySelector('.name').onclick = () => { location.hash = 'site/' + encodeURIComponent(site); };
    const ob = r.querySelector('.link-btn');
    if (ob) ob.onclick = () => chrome.tabs.create({ url: (ns[0].scheme || 'https:') + '//' + site });
    wrap.appendChild(r);
  });
}
