/* Browser-sync and Drive status line at the bottom of the popup. */

import { byId } from './dom.js';

/** Load and display browser-sync and Drive status. */
export async function renderFooter(K) {
  const s = await K.store.settings();
  const { syncState = {} } = await chrome.storage.local.get('syncState');
  const d = await K.store.drive();
  const sync = byId('syncLine');
  if (!s.browserSync) sync.textContent = 'Browser sync off';
  else {
    sync.innerHTML = K.icon('check', 12) + ' ';
    sync.append(syncState.full ? 'Browser sync full · this device only' : `Synced with browser${syncState.lastSync ? ' · ' + K.ago(syncState.lastSync) : ''}`);
    sync.style.display = 'flex'; sync.style.alignItems = 'center'; sync.style.gap = '6px';
  }
  const drive = byId('driveLine');
  drive.innerHTML = K.icon('lock', 11);
  if (d.connected && d.needsAuth) { drive.classList.add('warn'); drive.append('Drive needs sign-in'); }
  else drive.append(d.connected ? 'Drive backup' : 'No Drive backup');
}
