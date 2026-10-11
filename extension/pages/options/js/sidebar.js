/* Sidebar navigation for the options page.
   Renders note counts, tag links, and Sync / Import / Help entries from pageState. */

import { K, esc, pageState, query } from './state.js';

/** Notes the content script could not place on their page. */
export function unplacedNotes() {
  return pageState.notes.filter((n) => pageState.placement[n.id] === 'unplaced');
}

/** Paint the left nav, tag list, and bottom settings links from current filters and counts. */
export function renderNav() {
  const h = decodeURIComponent(location.hash.slice(1));
  const cur = (key) => (h === key || (key === '' && !h) ? ' aria-current="page"' : '');
  const sites = new Set(pageState.notes.map((n) => n.site));
  const item = (key, label, count) =>
    `<a href="#${key}"${cur(key)}><span>${label}</span>${count != null ? `<span class="n">${count}</span>` : ''}</a>`;
  query('#nav').innerHTML =
    item('', 'All notes', pageState.notes.length) +
    item('sites', 'Sites', sites.size) +
    item('unplaced', 'Couldn’t place', unplacedNotes().length) +
    item('trash', 'Trash', pageState.trash.length);

  const tagCounts = {};
  pageState.notes.forEach((n) => K.tagsOf(n.text).forEach((tag) => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; }));
  const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30);
  query('#tags').innerHTML = tags.length
    ? '<div class="nav-label">Tags</div>' + tags.map(([t, c]) =>
      `<a class="tag" href="#tag/${encodeURIComponent(t)}"${cur('tag/' + t)}><span>#${esc(t)}</span><span class="n">${c}</span></a>`).join('')
    : '';
  query('#nav2').innerHTML = item('sync', 'Sync &amp; backup') + item('io', 'Import &amp; export') + item('shortcuts', 'Help');
}
