/* Top-level options page renderer.
   Updates the sidebar, then delegates to the active view and sets document.title. */

import { pageState } from './state.js';
import { renderNav } from './sidebar.js';
import { renderAll } from './views/all-notes.js';
import { renderSites } from './views/sites.js';
import { renderTrash } from './views/trash.js';
import { renderSync } from './views/sync.js';
import { renderIO } from './views/import-export.js';
import { renderShortcuts } from './views/help.js';

/** Refresh nav and the current view; `fromStorage` is passed through for callers that care. */
export function render(fromStorage) {
  renderNav();
  const views = { all: renderAll, sites: renderSites, trash: renderTrash, sync: renderSync, io: renderIO, shortcuts: renderShortcuts };
  (views[pageState.view] || renderAll)(fromStorage);
  const titles = { all: 'All notes', sites: 'Sites', trash: 'Trash', sync: 'Sync & backup', io: 'Import & export', shortcuts: 'Help' };
  document.title = 'Kurippu - ' + (titles[pageState.view] || 'All notes');
}
