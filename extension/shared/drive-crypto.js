/* AES-GCM encrypt/decrypt and validation of Drive backup payloads.
   Derives a per-account key with PBKDF2 and rejects unsafe decrypted data.
   Depends on drive-auth.js for DriveError. */
(function (root) {
  'use strict';

  const D = root.__KurippuDrive;
  const K = root.Kurippu;
  if (!D) throw new Error('Drive auth missing: load drive-auth.js before drive-crypto.js');

  D.KDF_SALT = 'kurippu/drive-backup/v1';
  D.KDF_ITER = 310000;
  D.MAX_NOTES = 20000;
  D.MAX_TEXT = 1024 * 1024;

  const enc = new TextEncoder(), dec = new TextDecoder();

  /** Encode bytes as a base64 string in chunks safe for apply(). */
  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /** Decode a base64 string into a Uint8Array. */
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  /** Derive the AES key for one Google account. The account id never leaves this device. */
  async function keyFor(googleSubjectId) {
    const base = await crypto.subtle.importKey('raw', enc.encode(googleSubjectId), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(D.KDF_SALT), iterations: D.KDF_ITER, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /** Encrypt a backup object into the on-disk wrapper Drive stores. */
  D.encryptBackupPayload = async function encryptBackupPayload(googleSubjectId, payload) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(googleSubjectId), enc.encode(JSON.stringify(payload))));
    return JSON.stringify({ format: 'kurippu-backup', v: 1, kdf: 'PBKDF2-SHA256', iter: D.KDF_ITER, alg: 'AES-256-GCM', iv: b64(iv), data: b64(data) });
  };

  /** Decrypt and parse one bounded backup wrapper. */
  D.decryptBackupPayload = async function decryptBackupPayload(googleSubjectId, encryptedText) {
    if (encryptedText.length > D.MAX_DOWNLOAD_BYTES * 2) throw new D.DriveError('too-large', 'A Drive backup is too large to read safely.');
    let wrap;
    try { wrap = JSON.parse(encryptedText); } catch (e) { throw new D.DriveError('corrupt', 'The backup file is damaged.'); }
    if (wrap.format !== 'kurippu-backup' || wrap.v !== 1 || wrap.alg !== 'AES-256-GCM' ||
      wrap.kdf !== 'PBKDF2-SHA256' || wrap.iter !== D.KDF_ITER ||
      typeof wrap.iv !== 'string' || typeof wrap.data !== 'string' ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(wrap.iv) || !/^[A-Za-z0-9+/]*={0,2}$/.test(wrap.data)) {
      throw new D.DriveError('corrupt', 'The backup wrapper is not supported.');
    }
    let iv, data;
    try { iv = unb64(wrap.iv); data = unb64(wrap.data); } catch (e) {
      throw new D.DriveError('corrupt', 'The backup encoding is damaged.');
    }
    if (iv.length !== 12 || data.length > D.MAX_DOWNLOAD_BYTES) throw new D.DriveError('corrupt', 'The backup encryption data is invalid.');
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await keyFor(googleSubjectId), data);
      return JSON.parse(dec.decode(plain));
    } catch (e) {
      throw new D.DriveError('decrypt-failed', 'The backup could not be decrypted. It may be damaged or belong to another account.');
    }
  };

  /** Reject dangerous keys, excessive nesting, and non-JSON values. */
  function safeValue(value, depth) {
    if (depth > 12) return false;
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.length <= D.MAX_NOTES && value.every((item) => safeValue(item, depth + 1));
    if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
    return Object.keys(value).length <= 128 && Object.keys(value).every((key) =>
      !['__proto__', 'prototype', 'constructor'].includes(key) && safeValue(value[key], depth + 1));
  }

  /** Validate decrypted data before it is allowed to influence a new backup. */
  D.validatePayload = function validatePayload(data) {
    if (!data || data.format !== 'kurippu-notes' || ![1, 2].includes(data.v)) {
      const future = data && data.v > 2;
      throw new D.DriveError(future ? 'future-version' : 'corrupt',
        future ? 'This backup was made by a newer extension version.' : 'The backup contents are damaged.');
    }
    if (!safeValue(data, 0) || !Array.isArray(data.notes) || data.notes.length > D.MAX_NOTES) {
      throw new D.DriveError('corrupt', 'The backup contains an invalid number of notes.');
    }
    const ids = new Set();
    data.notes.forEach((note) => {
      if (!K.validNote(note) || !K.validRevision(note) || ids.has(note.id) ||
        (typeof note.text === 'string' && note.text.length > D.MAX_TEXT)) {
        throw new D.DriveError('corrupt', 'The backup contains an invalid note record.');
      }
      ids.add(note.id);
    });
    return { ...data, notes: data.notes.map(K.normalizeNote) };
  };
})(self);
