# Launch checklist

For maintainers. Releases are described in [README.md](README.md) → Releases. The marketing site has its own open items in [`website/LAUNCH_CHECKLIST.md`](website/LAUNCH_CHECKLIST.md).

What is still open before the extension is announced:

- [ ] **Release package checks.** The **Check extension package inputs** step in [`.github/workflows/release.yml`](.github/workflows/release.yml) already runs. On the next **Create Release**, confirm it passes and that the required manifest fields and paths still match what you ship.
- [ ] **Google OAuth client.** Create a Web-application OAuth client for the Chrome Web Store extension ID (not an unpacked ID), with redirect URI `https://<store-extension-id>.chromiumapp.org/oauth2`, and set `googleClientId` in `extension/shared/config.js`. Without it, Drive backup stays disabled for store users. See README → "Set up the OAuth client".
- [ ] **Chrome Web Store listing.** After a successful **Create Release**, download `kurippu-vX.Y.0.zip` from the GitHub Release, upload it in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), and publish. The workflow does not do this upload. When the listing is live, finish the install-link item on the website launch checklist.
- [ ] **Privacy promise.** Re-check the shipped extension: no analytics, trackers, ads, or crash reporters, and no network calls except the user's own Google Drive backup when they opt in. `extension/manifest.json` permissions and host permissions must still match what the code does.
- [ ] **Shortcuts and store copy.** Confirm Alt + Shift + N (and the context-menu / Ctrl·⌘ + click behaviour in README) match what you ship, then align the Chrome Web Store description with those facts so the website Shortcuts section can drop its "may change" wording.
