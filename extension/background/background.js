/* Kurippu - service worker: context menu, toolbar badge, browser sync
   mirroring and scheduled Drive backups. */
importScripts('../shared/config.js', '../shared/shared.js', '../shared/drive.js');

const K = self.Kurippu;
const Drive = self.KurippuDrive;
const WELCOME = chrome.runtime.getURL('pages/welcome/welcome.html');

/* ── Install ───────────────────────────────────────────────────────── */
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'add-note', title: 'Add sticky note here', contexts: ['page', 'selection', 'image', 'video', 'frame'] });
  });
  if (reason === 'install') chrome.tabs.create({ url: WELCOME });
  // Reloading replaces the script on tabs that are already open, which otherwise keep the previous copy.
  if (reason === 'update') injectOpenTabs();
  await reconcileSync();
  await ensurePeriodicAlarm();
});
chrome.runtime.onStartup.addListener(async () => {
  await recoverDriveJob();
  await reconcileSync();
  await ensurePeriodicAlarm();
});

/* ── Talking to tabs ───────────────────────────────────────────────── */
// Tabs opened before install have no content script yet; inject on demand.
async function injectOpenTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !K.canNote(tab.url || '')) continue;
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['shared/shared.js', 'content/content.js'] }); }
    catch (e) { /* this page does not allow injection */ }
  }
}
async function toTab(tab, msg) {
  if (!tab || tab.id == null) return;
  if (tab.url && tab.url.startsWith(WELCOME)) {
    chrome.runtime.sendMessage({ ...msg, target: 'welcome' }).catch(() => {});
    return;
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    if (!K.canNote(tab.url || '')) return;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['shared/shared.js', 'content/content.js'] });
      await new Promise((r) => setTimeout(r, 250));
      return await chrome.tabs.sendMessage(tab.id, msg);
    } catch (e2) { /* restricted page */ }
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'add-note') toTab(tab, { type: 'add-at-context' });
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'new-note') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  toTab(tab, { type: 'new-note' });
});

/* ── Messages ──────────────────────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || typeof msg !== 'object' || sender.id !== chrome.runtime.id) return;
  const tabId = sender.tab && sender.tab.id;
  switch (msg.type) {
    case 'status':
      if (tabId != null) setBadge(tabId, msg);
      recordPlacement(msg);
      return;
    case 'content-ready':
      if (tabId == null) return;
      takePendingJump(tabId).then((id) => reply({ jump: id }));
      return true;
    case 'open-note':
      openNote(msg.id).then(() => reply({ ok: true }));
      return true;
    case 'to-tab':
      chrome.tabs.get(msg.tabId).then((tab) => toTab(tab, msg.msg)).then((r) => reply(r || null), () => reply(null));
      return true;
    case 'sync-now':
      reconcileSync().then(() => reply({ ok: true }));
      return true;
    case 'drive':
      runDrive(msg.op).then(reply, (e) => reply({ error: e.message || String(e), code: e.code || 'error' }));
      return true;
    case 'store-mutation':
      commitMutation(msg).then((result) => reply(result), (e) => reply({ error: e.message || String(e) }));
      return true;
  }
});

let mutationQueue = Promise.resolve();

// Allocate note revisions in one service-worker queue so tabs cannot reuse an
// actor counter or race a read-modify-write of the same note.
function commitMutation(msg) {
  const run = async () => {
    const stored = await chrome.storage.local.get([K.SYNC_META_KEY, 'mutationEpoch']);
    const replica = stored[K.SYNC_META_KEY] || { actor: crypto.randomUUID(), counter: 0 };
    const input = msg.op === 'putMany' ? (Array.isArray(msg.notes) ? msg.notes : []) : [msg.note];
    const output = [];
    for (const note of input) {
      if (!K.validNote(note)) continue;
      if (msg.preserveSync) output.push(K.normalizeNote(note));
      else {
        replica.counter++;
        const existing = await K.store.get(note.id);
        const candidate = K.prepareLocalWrite(existing, note, replica.actor, replica.counter, msg.groups);
        if (msg.keepTime && Number.isFinite(note.updated)) candidate.updated = note.updated;
        output.push(...K.mergeNoteSets(existing ? [existing] : [], [candidate]));
      }
    }
    const values = {
      [K.SYNC_META_KEY]: replica,
      mutationEpoch: (stored.mutationEpoch || 0) + (output.length ? 1 : 0),
    };
    output.forEach((note) => { values[K.NOTE_PREFIX + note.id] = note; });
    if (output.length) await chrome.storage.local.set(values);
    const requested = output.find((note) => note.id === (msg.note && msg.note.id));
    return msg.op === 'putMany' ? { notes: output } : { note: requested || null };
  };
  const result = mutationQueue.then(run, run);
  mutationQueue = result.then(() => {}, () => {});
  return result;
}

let driveQueue = Promise.resolve();

// Persist and serialize Drive work. The record makes interrupted automatic
// jobs resumable after a Manifest V3 service-worker restart.
function queueDrive(op, task) {
  const run = async () => {
    const stored = await chrome.storage.local.get(['driveJob', 'drive', 'mutationEpoch']);
    const existing = stored.driveJob || {};
    const job = {
      jobId: existing.op === op && existing.jobId ? existing.jobId : crypto.randomUUID(),
      op, state: 'running', attempt: existing.op === op ? (existing.attempt || 0) : 0,
      createToken: stored.drive && stored.drive.createToken || '',
      capturedEpoch: stored.mutationEpoch || 0, startedAt: Date.now(), nextAttemptAt: 0,
    };
    await chrome.storage.local.set({ driveJob: job });
    try {
      const result = await task();
      await chrome.storage.local.remove('driveJob');
      await chrome.alarms.clear('kurippu-drive-retry');
      return result;
    } catch (e) {
      const retryable = ['network', 'rate-limit', 'server', 'contention'].includes(e.code);
      if (retryable) {
        const attempt = job.attempt + 1;
        const base = Math.min(360, Math.pow(2, Math.min(attempt, 8)));
        const delay = Math.max(e.retryAfter || 0, base * (0.5 + Math.random()));
        await chrome.storage.local.set({
          driveJob: { ...job, state: 'retrying', attempt, nextAttemptAt: Date.now() + delay * 60000, error: e.message },
        });
        chrome.alarms.create('kurippu-drive-retry', { delayInMinutes: delay });
      } else {
        await chrome.storage.local.set({ driveJob: { ...job, state: 'paused', error: e.message } });
      }
      throw e;
    }
  };
  const result = driveQueue.then(run, run);
  driveQueue = result.then(() => {}, () => {});
  return result;
}

// Resume an interrupted retryable backup and clear stale progress UI after a
// worker restart. Interactive sign-in and previews are never auto-resumed.
async function recoverDriveJob() {
  const { driveJob } = await chrome.storage.local.get('driveJob');
  await K.store.patchDrive({ backingUp: false });
  if (!driveJob || driveJob.op !== 'backup' || driveJob.state === 'paused') return;
  const delay = Math.max(0.1, ((driveJob.nextAttemptAt || Date.now()) - Date.now()) / 60000);
  chrome.alarms.create('kurippu-drive-retry', { delayInMinutes: delay });
}

recoverDriveJob().catch(() => {});

// Route every Drive operation through the same queue, including manual
// actions and alarms from separate options-page tabs.
async function runDrive(op) {
  if (op === 'configured') return { configured: Drive.configured(), redirect: Drive.redirectUrl() };
  if (op === 'schedule') { await ensurePeriodicAlarm(); return { ok: true }; }
  return queueDrive(op === 'reauth' ? 'backup' : op, async () => {
    switch (op) {
      case 'connect': { const r = await Drive.connect(); await ensurePeriodicAlarm(); return r; }
      case 'backup': return Drive.backup();
      case 'restore': return Drive.restore();
      case 'reconcile-preview': return Drive.reconcile(false);
      case 'reconcile-apply': { const r = await Drive.reconcile(true); await Drive.backup(); return r; }
      case 'info': return { info: await Drive.info() };
      case 'disconnect':
        await Drive.disconnect();
        await chrome.alarms.clear('kurippu-periodic');
        await chrome.alarms.clear('kurippu-drive-retry');
        await chrome.storage.local.remove('driveJob');
        return { ok: true };
      case 'reauth': return Drive.reauth();
      default: throw new Error('Unknown operation');
    }
  });
}

/* ── Badge ─────────────────────────────────────────────────────────── */
// Count of notes on the page; a dot when some couldn't be placed.
function setBadge(tabId, s) {
  const dot = s.unplaced && s.unplaced.length ? '•' : '';
  const text = s.hidden ? '' : (s.count ? String(s.count) : '') + dot;
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#2d2b2b' }).catch(() => {});
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' }).catch(() => {});
}

// Remember which notes couldn't be placed last time their page was open,
// for the options page's "Couldn't place" view.
let placementQueue = Promise.resolve();
function recordPlacement(s) {
  placementQueue = placementQueue.then(async () => {
    const cur = await K.store.placement();
    const next = { ...cur };
    (s.ok || []).forEach((id) => delete next[id]);
    (s.lost || []).forEach((id) => { next[id] = 'lost'; });
    (s.unplaced || []).forEach((id) => { next[id] = 'unplaced'; });
    if (JSON.stringify(next) !== JSON.stringify(cur)) await chrome.storage.local.set({ placement: next });
  }).catch(() => {});
}

/* ── Opening a note from the options page ─────────────────────────── */
async function openNote(id) {
  const n = await K.store.get(id);
  if (!n) return;
  const tab = await chrome.tabs.create({ url: K.hrefFor(n) });
  const { pendingJumps = {} } = await chrome.storage.session.get('pendingJumps');
  pendingJumps[tab.id] = id;
  await chrome.storage.session.set({ pendingJumps });
}
async function takePendingJump(tabId) {
  const { pendingJumps = {} } = await chrome.storage.session.get('pendingJumps');
  const id = pendingJumps[tabId];
  if (id) { delete pendingJumps[tabId]; await chrome.storage.session.set({ pendingJumps }); }
  return id || null;
}
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { pendingJumps } = await chrome.storage.session.get('pendingJumps');
  if (pendingJumps && pendingJumps[tabId]) { delete pendingJumps[tabId]; chrome.storage.session.set({ pendingJumps }); }
});

/* ── Browser sync ──────────────────────────────────────────────────────
   chrome.storage.local is the source of truth; every note is mirrored to
   chrome.storage.sync under the same "n:<id>" key and merged by revisions.
   Sync caps: 100 KB total, 8 KB per item, 512 items. Notes that don't fit
   stay on this device (and in the Drive backup, when that's on). */
const SYNC_ITEM_MAX = (chrome.storage.sync.QUOTA_BYTES_PER_ITEM || 8192) - 64;
const bytes = (key, val) => new TextEncoder().encode(key + JSON.stringify(val)).length;

const dirty = new Set();
let pushTimer = 0;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    const ids = Object.keys(changes).filter(K.isNoteKey);
    if (ids.length) {
      ids.forEach((k) => dirty.add(k));
      clearTimeout(pushTimer);
      pushTimer = setTimeout(pushDirty, 2500);
      scheduleBackup();
    }
    if (changes.settings) {
      const was = changes.settings.oldValue && changes.settings.oldValue.browserSync;
      const now = changes.settings.newValue && changes.settings.newValue.browserSync;
      if (now && !was) reconcileSync();
    }
  } else if (area === 'sync') {
    pullFromSync(changes);
  }
});

async function syncOn() { return (await K.store.settings()).browserSync !== false; }

async function pushDirty() {
  const keys = [...dirty];
  dirty.clear();
  if (!keys.length || !(await syncOn())) return;
  const [loc, rem] = await Promise.all([chrome.storage.local.get(keys), chrome.storage.sync.get(keys)]);
  const out = {}, toLocal = {};
  const tooBig = [];
  keys.forEach((k) => {
    const n = loc[k];
    if (!n) return;
    const r = rem[k];
    const merged = r && K.validNote(r) && K.validRevision(r) ? K.mergeNoteSets([n], [r]) : [K.normalizeNote(n)];
    merged.forEach((note) => {
      const key = K.NOTE_PREFIX + note.id;
      if (!loc[key] || K.canonical(K.normalizeNote(loc[key])) !== K.canonical(note)) toLocal[key] = note;
      if (bytes(key, note) > SYNC_ITEM_MAX) tooBig.push(note.id);
      else out[key] = note;
    });
  });
  if (Object.keys(toLocal).length) await chrome.storage.local.set(toLocal);
  await writeSync(out, tooBig);
}

async function writeSync(out, tooBig) {
  const state = (await chrome.storage.local.get('syncState')).syncState || {};
  let full = false;
  if (Object.keys(out).length) {
    try { await chrome.storage.sync.set(out); }
    catch (e) {
      // Over the total quota: write what fits, one by one.
      full = true;
      for (const k of Object.keys(out)) {
        try { await chrome.storage.sync.set({ [k]: out[k] }); } catch (e2) { break; }
      }
    }
  }
  const local = new Set([...(state.localOnly || []), ...tooBig]);
  Object.keys(out).forEach((k) => local.delete(k.slice(K.NOTE_PREFIX.length)));
  await chrome.storage.local.set({ syncState: { ...state, lastSync: Date.now(), full, localOnly: [...local].slice(0, 500) } });
}

async function pullFromSync(changes) {
  if (!(await syncOn())) return;
  const keys = Object.keys(changes).filter((k) => K.isNoteKey(k) && changes[k].newValue);
  if (!keys.length) return;
  const loc = await chrome.storage.local.get(keys);
  const out = {}, toSync = {}, tooBig = [];
  keys.forEach((k) => {
    const r = changes[k].newValue;
    if (!K.validNote(r) || !K.validRevision(r)) return;
    const l = loc[k];
    const merged = l ? K.mergeNoteSets([l], [r]) : [K.normalizeNote(r)];
    merged.forEach((note) => {
      const key = K.NOTE_PREFIX + note.id;
      if (!loc[key] || K.canonical(K.normalizeNote(loc[key])) !== K.canonical(note)) out[key] = note;
      if (bytes(key, note) > SYNC_ITEM_MAX) tooBig.push(note.id);
      else toSync[key] = note;
    });
  });
  if (Object.keys(out).length) await chrome.storage.local.set(out);
  await writeSync(toSync, tooBig);
}

// Fully reconcile both stores with the same causal resolver used by Drive.
async function reconcileSync() {
  if (!(await syncOn())) return;
  const [loc, rem] = await Promise.all([chrome.storage.local.get(null), chrome.storage.sync.get(null)]);
  const toLocal = {}, toSync = {}, tooBig = [];
  const localNotes = Object.keys(loc).filter(K.isNoteKey).map((k) => loc[k]).filter((n) => K.validNote(n) && K.validRevision(n));
  const remoteNotes = Object.keys(rem).filter(K.isNoteKey).map((k) => rem[k]).filter((n) => K.validNote(n) && K.validRevision(n));
  K.mergeNoteSets(localNotes, remoteNotes).forEach((note) => {
    const key = K.NOTE_PREFIX + note.id;
    if (!loc[key] || K.canonical(K.normalizeNote(loc[key])) !== K.canonical(note)) toLocal[key] = note;
    if (bytes(key, note) > SYNC_ITEM_MAX) tooBig.push(note.id);
    else if (!rem[key] || K.canonical(K.normalizeNote(rem[key])) !== K.canonical(note)) toSync[key] = note;
  });
  if (Object.keys(toLocal).length) await chrome.storage.local.set(toLocal);
  await writeSync(toSync, tooBig);
}

/* ── Drive backup scheduling ───────────────────────────────────────── */
async function scheduleBackup() {
  const d = await K.store.drive();
  if (!d.connected) return;
  if (d.schedule === 'change') {
    // Re-creating the alarm restarts it, so bursts of edits back up once.
    chrome.alarms.create('kurippu-backup', { delayInMinutes: 0.5 });
  } else if (!d.dirty) {
    await K.store.patchDrive({ dirty: true });
  }
}
async function ensurePeriodicAlarm() {
  const d = await K.store.drive();
  await chrome.alarms.clear('kurippu-periodic');
  if (!d.connected || d.schedule === 'change') return;
  const period = d.schedule === 'daily' ? 1440 : 60;
  chrome.alarms.create('kurippu-periodic', { delayInMinutes: period, periodInMinutes: period });
}
chrome.alarms.onAlarm.addListener(async (a) => {
  const d = await K.store.drive();
  if (!d.connected) return;
  if (a.name === 'kurippu-drive-retry') {
    runDrive('backup').catch(() => {});
  } else if (a.name === 'kurippu-backup' || (a.name === 'kurippu-periodic' && d.dirty)) {
    runDrive('backup').catch(() => {});
  }
});
