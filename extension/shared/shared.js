/* Final assembly of the shared classic-script runtime.
   Copies builder fields onto self/window.Kurippu so content scripts, pages,
   and the service worker keep the same public API as before the split. */
(function (root) {
  'use strict';

  const B = root.__KurippuBuilder;
  if (!B) {
    throw new Error('Shared builder missing: load constants.js before shared.js');
  }

  root.Kurippu = {
    DAY: B.DAY, HUES: B.HUES, COLORS: B.COLORS, palette: B.palette, isMac: B.isMac, modLabel: B.modLabel,
    pageKey: B.pageKey, canNote: B.canNote, hrefFor: B.hrefFor,
    esc: B.esc, md: B.md, inline: B.inline, toggleCheck: B.toggleCheck, tagsOf: B.tagsOf, firstLine: B.firstLine,
    ago: B.ago, short: B.short, fmt: B.fmt, bucket: B.bucket, plural: B.plural,
    NOTE_PREFIX: B.NOTE_PREFIX, SETTINGS_KEY: B.SETTINGS_KEY, SYNC_META_KEY: B.SYNC_META_KEY,
    DEFAULT_SETTINGS: B.DEFAULT_SETTINGS, store: B.store, newId: B.newId, isNoteKey: B.isNoteKey,
    portable: B.portable, validNote: B.validNote, validRevision: B.validRevision,
    canonical: B.canonical, stableHash: B.stableHash, normalizeNote: B.normalizeNote,
    compareVectors: B.compareVectors, mergeVector: B.mergeVector, mergeNote: B.mergeNote,
    mergeNoteSets: B.mergeNoteSets, prepareLocalWrite: B.prepareLocalWrite, groupsForKeys: B.groupsForKeys,
    NOTE_CSS: B.NOTE_CSS, icon: B.icon,
  };

  delete root.__KurippuBuilder;
})(typeof self !== 'undefined' ? self : this);
