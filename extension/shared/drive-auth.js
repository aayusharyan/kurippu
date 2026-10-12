/* Google OAuth token helpers for Drive backup.
   Obtains access tokens via launchWebAuthFlow and keeps them in session
   storage. First script in the Drive classic-script chain. */
(function (root) {
  'use strict';

  const D = root.__KurippuDrive = root.__KurippuDrive || {};

  D.SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.appdata'];

  /** Typed error with a stable code the backup job can switch on. */
  D.DriveError = class DriveError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  };

  /** Read the OAuth client id from config, or an empty string when unset. */
  D.clientId = function clientId() {
    return (root.KURIPPU_CONFIG && root.KURIPPU_CONFIG.googleClientId) || '';
  };

  /** Whether this build has a Google OAuth client id configured. */
  D.configured = function configured() {
    return !!D.clientId();
  };

  /* launchWebAuthFlow works in every Chromium browser (getAuthToken is
     Chrome-only). Access tokens live in storage.session - memory only. */
  /** Run the Google OAuth token flow, optionally with a login hint. */
  async function authFlow(interactive, hint) {
    if (!D.configured()) throw new D.DriveError('not-configured', 'Drive backup isn’t configured in this build.');
    const redirect = chrome.identity.getRedirectURL('oauth2');
    const p = new URLSearchParams({
      client_id: D.clientId(), response_type: 'token', redirect_uri: redirect,
      scope: D.SCOPES.join(' '), include_granted_scopes: 'true',
      prompt: interactive ? 'select_account' : 'none',
    });
    if (hint) p.set('login_hint', hint);
    let resp;
    try {
      resp = await chrome.identity.launchWebAuthFlow({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?' + p, interactive,
        abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 8000,
      });
    } catch (e) {
      throw new D.DriveError(interactive ? 'cancelled' : 'needs-auth', interactive ? 'Sign-in was cancelled.' : 'Sign in again to keep backing up.');
    }
    const frag = new URLSearchParams(new URL(resp).hash.slice(1));
    if (frag.get('error') || !frag.get('access_token')) throw new D.DriveError('needs-auth', 'Sign in again to keep backing up.');
    const tok = { token: frag.get('access_token'), exp: Date.now() + (+frag.get('expires_in') || 3600) * 1000 };
    await chrome.storage.session.set({ driveToken: tok });
    return tok.token;
  }

  /** Return a usable access token, refreshing silently or interactively. */
  D.token = async function token(interactive) {
    const { driveToken } = await chrome.storage.session.get('driveToken');
    if (driveToken && driveToken.exp - 60e3 > Date.now()) return driveToken.token;
    const d = await root.Kurippu.store.drive();
    try { return await authFlow(false, d.email); }
    catch (e) { if (!interactive) throw e; }
    return authFlow(true, d.email);
  };
})(self);
