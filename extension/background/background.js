/* Service-worker entry: loads config, shared, Drive, and background scripts
   in dependency order. Feature logic lives in the imported classic scripts. */
const SHARED_SCRIPTS = [
  '../shared/constants.js',
  '../shared/markdown.js',
  '../shared/time.js',
  '../shared/note-reconciliation.js',
  '../shared/storage.js',
  '../shared/note-css.js',
  '../shared/icons.js',
  '../shared/shared.js',
];
const DRIVE_SCRIPTS = [
  '../shared/drive-auth.js',
  '../shared/drive-http.js',
  '../shared/drive-crypto.js',
  '../shared/drive-ops.js',
  '../shared/drive.js',
];
/* Same ordered shared + content files as content_scripts / welcome.html. */
const CONTENT_INJECT_FILES = [
  'shared/constants.js',
  'shared/markdown.js',
  'shared/time.js',
  'shared/note-reconciliation.js',
  'shared/storage.js',
  'shared/note-css.js',
  'shared/icons.js',
  'shared/shared.js',
  'content/setup.js',
  'content/db.js',
  'content/motion.js',
  'content/shadow.js',
  'content/anchor.js',
  'content/render.js',
  'content/persist.js',
  'content/interact.js',
  'content/events.js',
  'content/fonts.js',
  'content/content.js',
];
const BACKGROUND_SCRIPTS = [
  'lifecycle.js',
  'mutations.js',
  'sync.js',
  'drive-schedule.js',
  'badge.js',
  'open-note.js',
  'listeners.js',
];

importScripts('../shared/config.js', ...SHARED_SCRIPTS, ...DRIVE_SCRIPTS);

self.__KurippuBackground = self.__KurippuBackground || {};
self.__KurippuBackground.CONTENT_INJECT_FILES = CONTENT_INJECT_FILES;

importScripts(...BACKGROUND_SCRIPTS);
