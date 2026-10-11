/* Hash router for the options page.
   Maps location.hash to view name and filter flags, then asks render to paint. */

import { pageState, main } from './state.js';
import { render } from './render.js';

/** Read the URL hash into pageState filters/view, render, and scroll to top. */
export function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  pageState.tagFilter = null; pageState.siteFilter = null; pageState.unplacedOnly = false;
  if (h.startsWith('tag/')) { pageState.view = 'all'; pageState.tagFilter = h.slice(4); }
  else if (h.startsWith('site/')) { pageState.view = 'all'; pageState.siteFilter = h.slice(5); }
  else if (h === 'unplaced') { pageState.view = 'all'; pageState.unplacedOnly = true; }
  else if (['sites', 'trash', 'sync', 'io', 'shortcuts'].includes(h)) pageState.view = h;
  else pageState.view = 'all';
  main.dataset.view = '';
  render();
  window.scrollTo(0, 0);
}

/** Listen for hash changes and re-route. */
export function initRouter() {
  window.addEventListener('hashchange', route);
}
