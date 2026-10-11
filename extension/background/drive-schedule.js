/* Drive backup job queue, retry alarms, and schedule helpers.
   Persists interrupted automatic jobs so a worker restart can resume them.
   Owns the single driveQueue singleton for this worker. */
(function (root) {
  'use strict';

  const BG = root.__KurippuBackground;
  const K = root.Kurippu;
  const Drive = root.KurippuDrive;
  if (!BG) throw new Error('Background lifecycle missing: load lifecycle.js before drive-schedule.js');
  if (!Drive) throw new Error('KurippuDrive missing: load the Drive chain before drive-schedule.js');

  let driveQueue = Promise.resolve();

  /** Let the next queued Drive job run whether this one succeeded or failed. */
  function advanceQueue(previousTask) {
    return previousTask.then(() => undefined, () => undefined);
  }

  /** Persist and serialize Drive work with resumable job metadata. */
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
    driveQueue = advanceQueue(result);
    return result;
  }

  /** Resume an interrupted retryable backup and clear stale progress UI. */
  BG.recoverDriveJob = async function recoverDriveJob() {
    const { driveJob } = await chrome.storage.local.get('driveJob');
    await K.store.patchDrive({ backingUp: false });
    if (!driveJob || driveJob.op !== 'backup' || driveJob.state === 'paused') return;
    const delay = Math.max(0.1, ((driveJob.nextAttemptAt || Date.now()) - Date.now()) / 60000);
    chrome.alarms.create('kurippu-drive-retry', { delayInMinutes: delay });
  };

  /** Route every Drive operation through the same queue. */
  BG.runDrive = async function runDrive(op) {
    if (op === 'configured') return { configured: Drive.configured(), redirect: Drive.redirectUrl() };
    if (op === 'schedule') { await BG.ensurePeriodicAlarm(); return { ok: true }; }
    return queueDrive(op === 'reauth' ? 'backup' : op, async () => {
      switch (op) {
        case 'connect': { const r = await Drive.connect(); await BG.ensurePeriodicAlarm(); return r; }
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
  };

  /** Mark Drive dirty or schedule a change-triggered backup alarm. */
  BG.scheduleBackup = async function scheduleBackup() {
    const d = await K.store.drive();
    if (!d.connected) return;
    if (d.schedule === 'change') {
      // Re-creating the alarm restarts it, so bursts of edits back up once.
      chrome.alarms.create('kurippu-backup', { delayInMinutes: 0.5 });
    } else if (!d.dirty) {
      await K.store.patchDrive({ dirty: true });
    }
  };

  /** Create or clear the periodic backup alarm from the user's schedule. */
  BG.ensurePeriodicAlarm = async function ensurePeriodicAlarm() {
    const d = await K.store.drive();
    await chrome.alarms.clear('kurippu-periodic');
    if (!d.connected || d.schedule === 'change') return;
    const period = d.schedule === 'daily' ? 1440 : 60;
    chrome.alarms.create('kurippu-periodic', { delayInMinutes: period, periodInMinutes: period });
  };

  /** Run a backup when a change, periodic, or retry alarm fires. */
  BG.onAlarm = async function onAlarm(a) {
    const d = await K.store.drive();
    if (!d.connected) return;
    if (a.name === 'kurippu-drive-retry') {
      BG.runDrive('backup').catch(() => {});
    } else if (a.name === 'kurippu-backup' || (a.name === 'kurippu-periodic' && d.dirty)) {
      BG.runDrive('backup').catch(() => {});
    }
  };

  BG.recoverDriveJob().catch(() => {});
})(self);
