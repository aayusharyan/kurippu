/* Sync & backup view: browser sync meter, Drive connect, schedule, restore dialogs. */

import { K, esc, pageState, query, main, load } from '../state.js';
import { openDialog } from '../dialog.js';

/** Send a Drive op to the background and return the result, or null on error. */
async function driveOp(op) {
  const r = await chrome.runtime.sendMessage({ type: 'drive', op });
  if (r && r.error) return null;
  return r;
}

/** Offer to merge a backup discovered right after connecting Google Drive. */
function foundDialog(f) {
  openDialog(`<div class="dialog-title" id="dt">Found a backup in your Drive</div>
    <dl><dt>Last saved</dt><dd>${esc(K.fmt(f.savedAt))}</dd><dt>From</dt><dd>${esc(f.from || 'Another browser')}</dd>
    <dt>Contents</dt><dd>${K.plural(f.count, 'note')} · ${Math.max(1, Math.round(f.size / 1024))} KB, encrypted</dd></dl>
    <div class="note-small">Missing note IDs will be added. Existing notes stay unchanged; you can reconcile them later from Sync &amp; backup.</div>
    <div class="dialog-actions"><button class="btn" data-close>Not now</button><button class="btn btn-primary" id="merge">Add missing notes</button></div>`,
  (box, close) => {
    box.querySelector('[data-close]').onclick = () => { close(); driveOp('backup'); };
    box.querySelector('#merge').onclick = async () => {
      close();
      const r = await driveOp('restore');
      if (!r) return;
      driveOp('backup');
    };
  });
}

/** Preview causal reconciliation before allowing remote lifecycle changes to
    update or permanently remove an existing local note. */
async function openReconcile() {
  const counts = await driveOp('reconcile-preview');
  if (!counts) return;
  const parts = [
    K.plural(counts.added, 'addition'), K.plural(counts.updated, 'update'),
    K.plural(counts.trashed, 'trash change'), K.plural(counts.purged, 'permanent deletion'),
    K.plural(counts.conflicts, 'conflict copy'),
  ];
  openDialog(`<div class="dialog-title" id="dt">Reconcile with Drive</div>
    <p class="prose">This will apply the same conflict rules used by automatic backup.</p>
    <div class="note-small">${parts.map(esc).join(' · ')}</div>
    ${counts.purged ? `<div class="warn-box">${K.icon('alert', 14)}<div>Permanent deletions remove matching local notes. Conflict copies preserve simultaneous text edits.</div></div>` : ''}
    <div class="dialog-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="apply">Apply reconciliation</button></div>`,
  (box, close) => {
    box.querySelector('[data-close]').onclick = close;
    box.querySelector('#apply').onclick = async () => {
      close();
      await driveOp('reconcile-apply');
    };
  });
}

/** Show Drive backup info and let the user add missing notes or open reconcile. */
async function openRestore() {
  const r = await driveOp('info');
  if (!r || !r.info) return;
  const f = r.info;
  openDialog(`<div class="dialog-title" id="dt">Restore from Drive</div>
    <dl><dt>Last saved</dt><dd>${esc(K.fmt(f.savedAt))} · ${K.plural(f.count, 'note')}</dd><dt>From</dt><dd>${esc(f.from || '-')}</dd>
    <dt>Size</dt><dd>${Math.max(1, Math.round(f.size / 1024))} KB, encrypted</dd><dt>Unlocked by</dt><dd>${esc(pageState.drive.email || '')}</dd></dl>
    <div class="note-small">Add missing keeps every existing note unchanged. Reconcile can update existing notes and will show a preview before applying deletions.</div>
    <div class="dialog-actions"><button class="btn" data-close>Cancel</button><button class="btn" id="reconcile">Reconcile…</button><button class="btn btn-primary" id="merge">Add missing notes</button></div>`,
  (box, close) => {
    box.querySelector('[data-close]').onclick = close;
    box.querySelector('#reconcile').onclick = () => { close(); openReconcile(); };
    box.querySelector('#merge').onclick = async () => {
      close();
      const res = await driveOp('restore');
      if (res) driveOp('backup');
    };
  });
}

/** Start Google sign-in, then reload and offer to merge an existing backup if found. */
async function connect() {
  pageState.connecting = true; renderSync();
  const r = await chrome.runtime.sendMessage({ type: 'drive', op: 'connect' });
  pageState.connecting = false;
  // Dynamic import avoids a render.js ↔ sync.js cycle at module load time.
  const { render } = await import('../render.js');
  await load(); render(true);
  if (r && r.error) return;
  if (r && r.found) foundDialog(r.found);
}

/** Render browser sync controls and the Google Drive backup section. */
export function renderSync() {
  main.dataset.view = 'sync';
  const s = pageState.settings, d = pageState.drive, st = pageState.syncState;
  const kb = pageState.syncBytes / 1024;
  const avg = pageState.notes.length ? pageState.notes.reduce((a, n) => a + JSON.stringify(n).length + 40, 0) / pageState.notes.length : 400;
  const fits = Math.max(1, Math.floor(102400 / avg));
  const localOnly = (st.localOnly || []).filter((id) => pageState.notes.some((n) => n.id === id)).length;
  const status = s.browserSync
    ? 'On · syncing through your browser profile'
    : 'Off · notes stay on this device';

  let drive;
  if (!pageState.driveConfigured) {
    drive = `<p class="prose">Notes are encrypted on this device with a key derived from your Google account, then saved to a hidden app folder in your Drive. Nothing passes through our servers.</p>
      <div class="warn-box">${K.icon('alert', 14)}<div>This build has no Google OAuth client ID, so Drive backup is switched off. Add one in <span class="mono">extension/shared/config.js</span> with the redirect URI <span class="mono">${esc(pageState.redirect)}</span>.</div></div>
      <button class="btn btn-primary btn-lg" disabled>Sign in with Google</button>`;
  } else if (pageState.connecting) {
    drive = '<p class="prose muted">Waiting for Google sign-in…</p>';
  } else if (!d.connected) {
    drive = `<p class="prose">Notes are encrypted on this device with a key derived from your Google account, then saved to a hidden app folder in your Drive. Nothing passes through our servers.</p>
      <button class="btn btn-primary btn-lg" id="signin">Sign in with Google</button>`;
  } else {
    const activeJob = pageState.driveJob && pageState.driveJob.state === 'running';
    const retrying = pageState.driveJob && pageState.driveJob.state === 'retrying';
    const sched = [['change', 'After every change'], ['hourly', 'Hourly'], ['daily', 'Daily']]
      .map(([v, l]) => `<button data-s="${v}" aria-pressed="${d.schedule === v}">${l}</button>`).join('');
    const last = d.backingUp ? 'Encrypting and uploading…' : d.lastBackup ? `${K.fmt(d.lastBackup)} · ${K.plural(d.lastCount || 0, 'note')}` : 'Never';
    drive = `
      <div class="account"><span class="avatar">${esc((d.email || '?').trim()[0].toUpperCase())}</span>
        <div class="who"><div style="font-size:14px">${esc(d.email)}</div><div style="font-size:12px" class="muted">Connected ${esc(K.fmt(d.connectedAt).replace(/,.*$/, '').replace('Today', 'today'))}</div></div>
        <button class="btn btn-ghost" id="disconnect">Disconnect</button></div>
      ${d.needsAuth ? `<div class="warn-box">${K.icon('alert', 14)}<div>Google signed Kurippu out, so backups are paused. <button class="link-btn" id="reauth">Sign in again</button></div></div>`
        : retrying ? `<div class="warn-box">${K.icon('refresh', 14)}<div>Backup will retry automatically${pageState.driveJob.error ? `: ${esc(pageState.driveJob.error)}` : '.'}</div></div>`
          : d.error ? `<div class="warn-box">${K.icon('alert', 14)}<div>Backup paused: ${esc(d.error)}</div></div>` : ''}
      ${d.duplicates ? `<div class="warn-box">${K.icon('alert', 14)}<div>${K.plural(d.duplicates, 'extra backup copy')} found. Every copy is merged safely and kept as recovery data.</div></div>` : ''}
      ${d.damaged ? `<div class="warn-box">${K.icon('alert', 14)}<div>${K.plural(d.damaged, 'damaged backup copy')} was left untouched. Valid copies are still being used.</div></div>` : ''}
      <dl class="facts">
        <dt>Last backup</dt><dd>${esc(last)}</dd>
        <dt>File</dt><dd>kurippu-backup-v2.enc · ${Math.max(1, Math.round((d.lastSize || 0) / 1024))} KB</dd>
        <dt>Location</dt><dd>Hidden app folder - doesn’t appear in your Drive</dd>
        <dt>Encryption</dt><dd>${K.icon('lock', 13)}AES-256, key derived from your Google account ID</dd>
      </dl>
      <div class="row-inline"><span class="lab">Back up</span><div class="seg" role="group" aria-label="Backup schedule">${sched}</div></div>
      <div class="btn-row">
        <button class="btn btn-primary" id="backup" ${d.backingUp || activeJob ? 'disabled' : ''}>${K.icon('refresh', 14)}Back up now</button>
        <button class="btn" id="restore" ${activeJob ? 'disabled' : ''}>Restore from backup…</button>
      </div>`;
  }

  main.innerHTML = `<div class="view narrow">
    <h1 class="view-title">Sync &amp; backup</h1>
    <div class="section">
      <div class="section-label"><h2 class="section-title">Browser sync</h2><div class="section-sub">Rides on the sync of your browser profile - Chrome, or any Chromium browser that syncs extension data.</div></div>
      <div class="section-body">
        <div class="status-line">${s.browserSync ? `<span style="color:var(--color-accent-700);display:flex">${K.icon('check', 16)}</span>` : ''}<span>${status}</span>
          <button class="switch" id="bs" role="switch" aria-checked="${!!s.browserSync}" aria-label="Browser sync"></button></div>
        <div class="meter">
          <div class="meter-top"><span>Browser sync storage</span><span>${kb.toFixed(1)} KB of 100 KB</span></div>
          <div class="meter-bar${st.full ? ' full' : ''}"><div style="width:${Math.min(100, kb).toFixed(1)}%"></div></div>
          <div class="note-small">Browsers cap extension sync at 100 KB - about ${fits} notes like yours. Past that, new notes stay on this device unless Drive backup is on.${
            localOnly ? ` ${K.plural(localOnly, 'note is', 'notes are')} too long or didn’t fit, and stay on this device.` : ''}${
            st.lastSync && s.browserSync ? ` Last synced ${esc(K.ago(st.lastSync))}.` : ''}</div>
        </div>
      </div>
    </div>
    <div class="rule"></div>
    <div class="section">
      <div class="section-label"><h2 class="section-title">Google Drive backup</h2><div class="section-sub">Encrypted recovery data with conflict-safe updates, restorable on any browser.</div></div>
      <div class="section-body">${drive}</div>
    </div>
  </div>`;

  query('#bs').onclick = async () => { await K.store.patchSettings({ browserSync: !s.browserSync }); };
  /** Bind onclick for an element by id when that element exists. */
  const on = (id, fn) => { const b = query('#' + id); if (b) b.onclick = fn; };
  on('signin', connect);
  on('reauth', () => driveOp('reauth'));
  on('disconnect', () => driveOp('disconnect'));
  on('backup', () => driveOp('backup'));
  on('restore', openRestore);
  main.querySelectorAll('[data-s]').forEach((b) => b.onclick = async () => {
    await K.store.patchDrive({ schedule: b.dataset.s });
    chrome.runtime.sendMessage({ type: 'drive', op: 'schedule' });
  });
}
