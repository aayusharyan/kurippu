/* Build-time configuration for optional Google Drive backup.
   googleClientId: an OAuth 2.0 client of type "Web application" from
   Google Cloud Console, with this authorised redirect URI:
     https://<your-extension-id>.chromiumapp.org/oauth2
   See the repository README.md → "Google Drive backup" / "Set up the OAuth
   client". Leave empty to ship without Drive backup; the Sync page will say
   it isn't configured. */
self.KURIPPU_CONFIG = {
  googleClientId: '',
};
