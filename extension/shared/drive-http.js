/* Authenticated Drive HTTP helpers and appDataFolder file I/O.
   Lists, downloads, and uploads backup candidates. Depends on drive-auth.js. */
(function (root) {
  'use strict';

  const D = root.__KurippuDrive;
  if (!D) throw new Error('Drive auth missing: load drive-auth.js before drive-http.js');

  D.LEGACY_FILE_NAME = 'kurippu-backup.enc';
  D.FILE_NAME = 'kurippu-backup-v2.enc';
  D.API = 'https://www.googleapis.com/drive/v3';
  D.UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  D.MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

  /** Map a Drive HTTP status to the error code the backup job uses to retry or pause. */
  function driveErrorCodeFromHttpStatus(status) {
    if (status === 401) return 'needs-auth';
    if (status === 408) return 'network';
    if (status === 412) return 'conflict';
    if (status === 429) return 'rate-limit';
    if (status >= 500) return 'server';
    if (status === 403) return 'forbidden';
    return 'http';
  }

  /** Send an authenticated request and retry once when an access token expires. */
  D.api = async function api(url, opts, retried) {
    const t = await D.token(false);
    let r;
    try {
      r = await fetch(url, { ...opts, headers: { ...(opts && opts.headers), Authorization: 'Bearer ' + t } });
    } catch (e) {
      throw new D.DriveError('network', 'Could not reach Google Drive.');
    }
    if (r.status === 401 && !retried) {
      await chrome.storage.session.remove('driveToken');
      return D.api(url, opts, true);
    }
    if (!r.ok) {
      const code = driveErrorCodeFromHttpStatus(r.status);
      const error = new D.DriveError(code, `Google Drive returned ${r.status}.`);
      error.status = r.status;
      const retry = r.headers.get('Retry-After') || '';
      const asSeconds = /^\d+$/.test(retry) ? +retry : Math.max(0, (Date.parse(retry) - Date.now()) / 1000);
      error.retryAfter = Number.isFinite(asSeconds) ? asSeconds : 0;
      throw error;
    }
    return r;
  };

  /** Fetch the signed-in Google account profile (openid userinfo). */
  D.userinfo = async function userinfo() {
    const r = await D.api('https://openidconnect.googleapis.com/v1/userinfo');
    return r.json();
  };

  /** List all current and legacy candidates, following Drive pagination. */
  D.listFiles = async function listFiles() {
    const files = [];
    let pageToken = '';
    const query = encodeURIComponent(`(name='${D.FILE_NAME}' or name='${D.LEGACY_FILE_NAME}') and trashed=false`);
    do {
      const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const fields = encodeURIComponent('nextPageToken,files(id,name,size,modifiedTime,appProperties,version)');
      const r = await D.api(`${D.API}/files?spaces=appDataFolder&q=${query}&pageSize=1000&fields=${fields}${page}`);
      const json = await r.json();
      files.push(...(json.files || []));
      pageToken = json.nextPageToken || '';
    } while (pageToken);
    return files;
  };

  /** Download a candidate with the ETag required for conditional updates. */
  D.download = async function download(id) {
    const r = await D.api(`${D.API}/files/${id}?alt=media`);
    const length = +(r.headers.get('Content-Length') || 0);
    if (length > D.MAX_DOWNLOAD_BYTES) throw new D.DriveError('too-large', 'A Drive backup is too large to read safely.');
    let etag = r.headers.get('ETag') || '';
    if (!etag) {
      const metadata = await D.api(`${D.API}/files/${id}?fields=id`);
      etag = metadata.headers.get('ETag') || '';
    }
    return { text: await r.text(), etag };
  };

  /** Create or conditionally update one multipart backup file. */
  D.upload = async function upload(fileId, body, appProperties, etag) {
    const boundary = 'kurippu' + Math.random().toString(36).slice(2);
    const meta = fileId ? { appProperties } : { name: D.FILE_NAME, parents: ['appDataFolder'], appProperties };
    const payload = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${body}\r\n--${boundary}--`;
    const url = fileId ? `${D.UPLOAD}/files/${fileId}?uploadType=multipart&fields=id,size,version` : `${D.UPLOAD}/files?uploadType=multipart&fields=id,size,version`;
    const headers = { 'Content-Type': `multipart/related; boundary=${boundary}` };
    if (fileId && etag) headers['If-Match'] = etag;
    const r = await D.api(url, { method: fileId ? 'PATCH' : 'POST', headers, body: payload });
    return { ...(await r.json()), etag: r.headers.get('ETag') || '' };
  };
})(self);
