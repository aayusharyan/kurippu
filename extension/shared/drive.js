/* Final assembly of the Drive classic-script runtime.
   Copies public operations onto self.KurippuDrive and drops the private parts
   object. Service-worker only; load after the Drive feature scripts. */
(function (root) {
  'use strict';

  const D = root.__KurippuDrive;
  if (!D || !D.connect || !D.backup) {
    throw new Error('Drive ops missing: load drive-ops.js before drive.js');
  }

  root.KurippuDrive = {
    configured: D.configured,
    connect: D.connect,
    backup: D.backup,
    restore: D.restore,
    reconcile: D.reconcile,
    info: D.info,
    disconnect: D.disconnect,
    reauth: D.reauth,
    redirectUrl: () => chrome.identity.getRedirectURL('oauth2'),
  };

  delete root.__KurippuDrive;
})(self);
