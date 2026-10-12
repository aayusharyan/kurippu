/* Connect, backup, restore, reconcile, and disconnect operations.
   Merges remote candidates with local notes and writes encrypted snapshots.
   Depends on drive-auth, drive-http, and drive-crypto. */
(function (root) {
  'use strict';

  const D = root.__KurippuDrive;
  const K = root.Kurippu;
  if (!D || !D.api || !D.encryptBackupPayload) {
    throw new Error('Drive parts missing: load drive-auth, drive-http, and drive-crypto before drive-ops.js');
  }

  const MAX_CONFLICT_RETRIES = 8;

  /** A short operating-system name for the "backed up from" line. */
  function osLabelFromPlatform(platformString) {
    if (/mac/i.test(platformString)) return 'macOS';
    if (/win/i.test(platformString)) return 'Windows';
    if (/cros/i.test(platformString)) return 'ChromeOS';
    if (/linux/i.test(platformString)) return 'Linux';
    return platformString;
  }

  /** Build a human-readable browser-and-OS label for this device. */
  function deviceLabel() {
    const ua = navigator.userAgentData;
    let browser = 'Chromium';
    if (navigator.brave) browser = 'Brave';
    else if (ua && ua.brands) {
      const b = ua.brands.map((x) => x.brand).find((x) => !/not.?a.?brand|chromium/i.test(x));
      if (b) browser = b.replace('Google ', '');
    }
    const platformString = (ua && ua.platform) || navigator.platform || '';
    const os = osLabelFromPlatform(platformString);
    return os ? `${browser} on ${os}` : browser;
  }

  /** Merge every valid candidate. If all are damaged, stop before any write. */
  async function readRemote(sub) {
    const files = await D.listFiles();
    if (!files.length) return null;
    const valid = [], damaged = [];
    for (const file of files) {
      try {
        if (+file.size > D.MAX_DOWNLOAD_BYTES * 2) throw new D.DriveError('too-large', 'A Drive backup is too large to read safely.');
        const downloaded = await D.download(file.id);
        valid.push({ file, data: D.validatePayload(await D.decryptBackupPayload(sub, downloaded.text)), etag: downloaded.etag });
      } catch (e) {
        damaged.push({ id: file.id, name: file.name, code: e.code || 'corrupt', message: e.message });
      }
    }
    if (!valid.length) {
      const future = damaged.find((item) => item.code === 'future-version');
      throw new D.DriveError(future ? 'future-version' : 'corrupt',
        future ? future.message : 'Every Drive backup copy is damaged.');
    }
    const future = damaged.find((item) => item.code === 'future-version');
    if (future) throw new D.DriveError('future-version', future.message);
    const notes = K.mergeNoteSets(...valid.map((item) => item.data.notes));
    const current = valid.filter((item) => item.file.name === D.FILE_NAME)
      .sort((a, b) => a.file.id.localeCompare(b.file.id));
    return { candidates: valid, damaged, notes, canonical: current[0] || null };
  }

  /** Summarize a remote merge result for the options UI. */
  function summary(remote) {
    const notes = remote.notes.filter((n) => !n.purged && !n.trashed);
    const newest = remote.candidates.slice().sort((a, b) => (+b.data.savedAt || 0) - (+a.data.savedAt || 0))[0];
    return {
      savedAt: newest && newest.data.savedAt, from: newest && newest.data.from || '', count: notes.length,
      size: remote.candidates.reduce((total, item) => total + (+item.file.size || 0), 0),
      duplicates: Math.max(0, remote.candidates.length - 1), damaged: remote.damaged.length,
    };
  }

  /** Sign in, store account fields, and either report a found backup or create one. */
  D.connect = async function connect() {
    await D.token(true);
    const u = await D.userinfo();
    if (!u.sub) throw new D.DriveError('http', 'Google didn’t return an account ID.');
    await K.store.patchDrive({
      connected: true, email: u.email || '', sub: u.sub,
      connectedAt: Date.now(), needsAuth: false, error: '',
    });
    const remote = await readRemote(u.sub);
    if (remote) return { found: summary(remote) };
    await D.backup();
    return { found: null };
  };

  /** Return a summary of the remote backup when Drive is connected. */
  D.info = async function info() {
    const d = await K.store.drive();
    if (!d.connected) return null;
    const remote = await readRemote(d.sub);
    return remote ? summary(remote) : null;
  };

  /** Compare logical note collections independent of object and array order. */
  function sameNotes(a, b) {
    const ordered = (notes) => notes.slice().sort((x, y) => x.id.localeCompare(y.id)).map(K.normalizeNote);
    return K.canonical(ordered(a)) === K.canonical(ordered(b));
  }

  /** Merge local notes with the remote copies and encrypt that snapshot. */
  async function buildBackupPayload(googleSubjectId) {
    const mine = (await K.store.allRaw()).map(K.normalizeNote);
    const mutationEpoch = (await chrome.storage.local.get('mutationEpoch')).mutationEpoch || 0;
    const remote = await readRemote(googleSubjectId);
    const notes = K.mergeNoteSets(mine, remote ? remote.notes : []);
    const payload = {
      format: 'kurippu-notes', v: 2, snapshotId: crypto.randomUUID(),
      parents: remote ? remote.candidates.map((item) => item.data.snapshotId).filter(Boolean).sort() : [],
      savedAt: Date.now(), from: deviceLabel(),
      writer: ((await chrome.storage.local.get(K.SYNC_META_KEY))[K.SYNC_META_KEY] || {}).actor || '',
      notes,
    };
    const body = await D.encryptBackupPayload(googleSubjectId, payload);
    return { remote, notes, mutationEpoch, body };
  }

  /** Upload one snapshot, refusing to write when Drive did not give a revision tag. */
  async function uploadBackupWithConflictRetry(remote, body, createToken) {
    if (remote && remote.canonical && !remote.canonical.etag) {
      throw new D.DriveError('etag-missing', 'Google Drive did not provide a revision tag, so the backup was paused safely.');
    }
    return D.upload(
      remote && remote.canonical ? remote.canonical.file.id : null,
      body, { protocol: '2', createToken },
      remote && remote.canonical ? remote.canonical.etag : '',
    );
  }

  /** Read the backup back. Returns it only when the stored notes match what we wrote. */
  async function verifyBackupMatchesExpected(googleSubjectId, expectedNotes) {
    const verify = await readRemote(googleSubjectId);
    if (!verify || !sameNotes(expectedNotes, verify.notes)) return null;
    return verify;
  }

  /** Use an ETag-guarded read-merge-write loop so a stale browser retries. */
  D.backup = async function backup() {
    const d = await K.store.drive();
    if (!d.connected) throw new D.DriveError('not-connected', 'Drive isn’t connected.');
    await K.store.patchDrive({ backingUp: true });
    const createToken = d.createToken || crypto.randomUUID();
    if (!d.createToken) await K.store.patchDrive({ createToken });
    try {
      for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
        const built = await buildBackupPayload(d.sub);
        let result;
        try {
          result = await uploadBackupWithConflictRetry(built.remote, built.body, createToken);
        } catch (e) {
          if (e.code === 'conflict') continue;
          throw e;
        }
        const verify = await verifyBackupMatchesExpected(d.sub, built.notes);
        if (!verify) continue;
        const currentEpoch = (await chrome.storage.local.get('mutationEpoch')).mutationEpoch || 0;
        const live = built.notes.filter((n) => !n.purged && !n.trashed).length;
        await K.store.patchDrive({
          backingUp: false, lastBackup: Date.now(), lastCount: live, lastSize: +result.size || built.body.length,
          fileId: result.id, dirty: currentEpoch !== built.mutationEpoch, needsAuth: false, error: '',
          duplicates: Math.max(0, verify.candidates.length - 1), damaged: verify.damaged.length,
        });
        return { count: live, duplicates: Math.max(0, verify.candidates.length - 1), damaged: verify.damaged.length };
      }
      throw new D.DriveError('contention', 'Drive changed repeatedly while backing up. It will retry shortly.');
    } catch (e) {
      await K.store.patchDrive({ backingUp: false, needsAuth: e.code === 'needs-auth', error: e.message });
      throw e;
    }
  };

  /** Merge: notes missing on this device are added; existing ones are kept. */
  D.restore = async function restore() {
    const d = await K.store.drive();
    const remote = await readRemote(d.sub);
    if (!remote) return { added: 0, total: 0 };
    const mine = new Set((await K.store.allRaw()).map((n) => n.id));
    const add = remote.notes.filter((n) => K.validNote(n) && !n.purged && !mine.has(n.id));
    await K.store.putMany(add, { preserveSync: true });
    await K.store.patchDrive({ merged: true });
    return { added: add.filter((n) => !n.trashed).length, total: remote.notes.length };
  };

  /** Preview or apply a full reconciliation. The UI must confirm before apply. */
  D.reconcile = async function reconcile(apply) {
    const d = await K.store.drive();
    const remote = await readRemote(d.sub);
    if (!remote) return { added: 0, updated: 0, trashed: 0, purged: 0, conflicts: 0 };
    const mine = await K.store.allRaw();
    const before = new Map(mine.map((n) => [n.id, n]));
    const merged = K.mergeNoteSets(mine, remote.notes);
    const counts = { added: 0, updated: 0, trashed: 0, purged: 0, conflicts: 0 };
    merged.forEach((note) => {
      const old = before.get(note.id);
      if (!old) {
        if (note.id.includes(':conflict:')) counts.conflicts++;
        else counts.added++;
      }
      else if (K.canonical(K.normalizeNote(old)) !== K.canonical(note)) {
        if (note.purged && !old.purged) counts.purged++;
        else if (note.trashed && !old.trashed) counts.trashed++;
        else counts.updated++;
      }
    });
    if (apply) await K.store.putMany(merged, { preserveSync: true });
    return counts;
  };

  /** Revoke the session token and clear connected Drive state. */
  D.disconnect = async function disconnect() {
    const { driveToken } = await chrome.storage.session.get('driveToken');
    await chrome.storage.session.remove('driveToken');
    if (driveToken) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(driveToken.token), { method: 'POST' }).catch(() => {});
    const d = await K.store.drive();
    await K.store.patchDrive({
      connected: false, email: '', sub: '', connectedAt: 0, lastBackup: 0, fileId: '', needsAuth: false,
      error: '', dirty: false, merged: false, schedule: d.schedule,
    });
  };

  /** Interactive re-auth, then run a backup. */
  D.reauth = async function reauth() {
    await D.token(true);
    await K.store.patchDrive({ needsAuth: false, error: '' });
    return D.backup();
  };
})(self);
