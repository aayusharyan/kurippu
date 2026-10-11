/* Fixed popup controls: header icons and navigation into the options page. */

import { byId } from './dom.js';

/** Paint the header icons from the shared icon set. */
export function paintIcons(K) {
  byId('mark').innerHTML = K.icon('note', 13, 2.2);
  byId('settings').innerHTML = K.icon('settings', 15);
  byId('new').innerHTML = K.icon('plus', 14) + 'New note';
}

/** Open the options page at an optional section, then close the popup. */
function openOptions(hash) {
  chrome.tabs.create({ url: chrome.runtime.getURL('pages/options/options.html' + (hash ? '#' + hash : '')) });
  window.close();
}

/** Bind settings, all-notes, and Drive footer navigation. */
export function bindNavigation() {
  byId('settings').onclick = () => openOptions('sync');
  byId('all').onclick = byId('all2').onclick = () => openOptions('');
  byId('driveLine').onclick = () => openOptions('sync');
}
