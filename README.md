# Kurippu (குறிப்பு · クリップ) - sticky notes for any website

**Stick a note on any website.** Right-click, write, done. Your note comes back exactly where you left it: next visit, next week, on your other computer.

Kurippu is a free, open-source browser extension (Manifest V3) for Chrome, Microsoft Edge and Brave. Notes are written in Markdown, remember the part of the page they are stuck to, and live in your browser and, if you choose, your own Google Drive. There is no account, no server and no analytics.

**The name** is the same sound in two languages: குறிப்பு (_kuṟippu_) is Tamil for "a note", and クリップ (_kurippu_) is Japanese for "a clip". Between them is the whole idea: a note, clipped to a page.

- Website: [kurippu.yush.dev](https://kurippu.yush.dev)
- Source: [github.com/aayusharyan/kurippu](https://github.com/aayusharyan/kurippu)
- Chrome Web Store ID: `gaibhdliodoodaiohhabjakiejeldikh` (the listing is not published yet, see [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md))

## What it does

- **Notes on any page.** Right-click and pick **Add sticky note here**, or Ctrl + click (⌘ + click on macOS) on empty space, or press Alt + Shift + N.
- **Markdown, with a preview.** Write in edit mode, flip to a typeset preview. Task-list checkboxes can be ticked straight from the preview.
- **Survives redesigns.** Each note remembers the element it is pinned to and where it sat, so it follows that element when the layout changes.
- **Six paper colours**: amber, sage, sky, rose, lilac and paper.
- **Minimise, drag, delete.** Shrink a note to a small chip, drag it by its coloured band, or send it to the Trash.
- **Hide notes per site.** One switch in the toolbar popup hides every note on a site, handy when you share your screen.
- **Find everything again.** The options page lists every note by site or by date, with search, colour and `#tag` filters.
- **Sync and backup.** Notes sync through your browser account with no setup. Optional encrypted backup goes to a hidden app folder in your own Google Drive, with no size limit.
- **Your data, portable.** Export every note as plain JSON, and import it into any browser.

## Privacy

Kurippu has no database, and that is the point.

- No account with us. Google sign-in, if you turn on backup, talks straight to your own Drive.
- Notes are never sent to us or to the sites you visit.
- No analytics, trackers, ads or crash reporters in the extension.
- Drive backups are encrypted on your device before they leave it.
- Notes are drawn in a closed shadow root, out of reach of the page's own scripts and styles.
- The only network calls are to Google, and only after you opt in to Drive backup (see [Google Drive backup](#google-drive-backup)).

The website's privacy policy, at [kurippu.yush.dev/privacy](https://kurippu.yush.dev/privacy/), covers the extension and the site in full.

## Install from source

There is no build step. The extension is plain JavaScript, loaded as-is.

1. Clone the repository (see [Website submodule](#website-submodule) for the `--recurse-submodules` flag), or download `kurippu-vX.Y.0.zip` from [GitHub Releases](https://github.com/aayusharyan/kurippu/releases) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `extension/` folder.
4. The welcome page opens. Ctrl + click (⌘ + click on macOS) inside the dashed box to try your first note.

To use notes on local `file://` pages, also turn on **Allow access to file URLs** on the extension's details page.

## Using it

On any web page:

| Do this                                          | What happens                                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Right-click → **Add sticky note here**           | Opens a new note in edit mode where you clicked                                                            |
| Ctrl + click (⌘ + click on macOS) on empty space | Same, for pages with their own right-click menu. Links, buttons, fields and selected text behave as normal |
| Alt + Shift + N                                  | Adds a note in the middle of the page. Change the key at `chrome://extensions/shortcuts`                   |
| Ctrl / ⌘ + Enter, or click **Preview**           | Shows the rendered note                                                                                    |
| Click **Edit**, or double-click a note           | Opens it for editing                                                                                       |
| Drag the coloured band                           | Moves the note. It re-pins to the nearest element where you drop it                                        |
| Click the minimise button (-)                    | Shrinks the note to a paper chip. Drag the chip, or click it to reopen                                     |
| Click the trash button                           | Moves the note to the Trash                                                                                |

A note stays in edit until you switch it to preview, and that choice is saved with the note, so a refresh keeps it. Kurippu never overrides a page's own right-click menu (maps, editors): use Ctrl / ⌘ + click there instead. Key presses inside a note stay inside it, so site shortcuts don't fire while you type.

### Markdown

| Type this                                          | To get                               |
| -------------------------------------------------- | ------------------------------------ |
| `#`, `##`, `###`                                   | Headings                             |
| `**bold**`, `*italic*` or `_italic_`, `~~strike~~` | Inline styles                        |
| `` `code` ``                                       | Inline code                          |
| `[label](https://…)`, or a bare `https://…`        | Links                                |
| `- item`, `* item`, `+ item`                       | Bullets                              |
| `1. item` or `1) item`                             | Numbered list                        |
| `- [ ]`, `- [x]`                                   | Task list (click to tick in preview) |
| `> quote`                                          | Quote                                |
| `---`                                              | Horizontal rule                      |
| `#tag`                                             | Tag, filterable on the options page  |

Note text is escaped before rendering, so raw HTML in a note is shown as text.

### The toolbar popup

- **Show on this site**: hides or shows every note on the current site.
- **On this page**: every note on the page. Click one to scroll to it.
- **Couldn't place**: notes whose spot no longer exists. **Place** lets you click where the note belongs (Esc cancels).
- **New note**, **All notes** (opens the options page), and the gear, which opens **Sync & backup**.
- The footer shows browser sync and Drive backup status.

The toolbar badge shows how many notes are on the current page, plus a dot when one of them couldn't be placed.

### The options page

| Section             | What it holds                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **All notes**       | Every note, grouped **By site** or by **Timeline**. Search across text, site, path and title, filter by colour or `#tag`, and export |
| **Sites**           | Every site with notes, with note and page counts, and whether notes are hidden there                                                 |
| **Couldn't place**  | Only the notes that couldn't find their spot                                                                                         |
| **Trash**           | Deleted notes. **Restore** one, delete it forever, or **Empty trash**                                                                |
| **Sync & backup**   | Browser sync switch and usage meter, and Google Drive backup                                                                         |
| **Import & export** | Download all notes as `kurippu-notes.json`, or import a JSON file                                                                    |
| **Help**            | Shortcuts, **Change keyboard shortcuts**, **Open welcome page**, the **Note animations** switch, and the Markdown list               |

### Animations

A new note pops in, a dragged note swings from where you hold it (and coasts a little if you let go mid-throw), minimising drops in a paper chip, opening a chip springs the note back, and a deleted note fades out. Turn this off under **Help → Note animations**. The setting is saved on that device only, applies to the welcome page too, and animations are always off when the system asks for reduced motion.

## How notes find their place again

A note is tied to a page by its host, path and query string. The `#hash` and common tracking parameters (`utm_*`, `fbclid`, `gclid`, `mc_eid`, `ref_src`) are ignored, so the same article with a different campaign link shows the same notes.

Each note stores:

- an **element anchor**: a CSS selector, the element's tag, the first 80 characters of its text (or an image's alt text or file name), and the note's offset from that element
- a **fallback page coordinate**
- up to 120 characters of the page title, used when searching notes

When a page loads, Kurippu checks the selector and compares the element's text with the stored text. If that fails, it looks for an element with the same tag whose text matches, so notes survive redesigns that move or re-nest content. Then one of three things happens:

- **Found**: the note follows the element and sits where you left it.
- **Anchor lost**: the note shows at its saved coordinate with a dashed outline, plus **Pin to nearby text** and **Keep here**.
- **Couldn't place**: the saved coordinate is past the end of the page, so the note isn't drawn. The popup lists it with a **Place** button, and the options page lists it under **Couldn't place**.

Notes are repositioned when the window resizes, the page's content changes, fonts finish loading, an inner container scrolls, or a single-page app changes its URL.

## Storage and sync

- `chrome.storage.local` is the source of truth. Each note has its own key (`n:<id>`), so two tabs never overwrite each other's notes. Settings live under `settings` and stay on the device.
- **Browser sync**: the service worker mirrors every note to `chrome.storage.sync` under the same key. Browsers give each extension 100 KB of sync space and about 8 KB per item. A note too large for one item, or one that arrives after the space is full, stays on this device, and the **Sync & backup** page says so. Brave's sync chain may not carry extension data, so test it before you rely on it.
- **Merging**: each note keeps separate revisions for its content, appearance (colour and edit or preview mode), placement and lifecycle (trash and delete). Revisions use per-device counters, not clocks, so independent changes merge cleanly. When two devices edit the same text at once, one version wins and the other is kept as a separate conflict-copy note, so no text silently disappears.
- **Trash**: deleting moves a note to the Trash. Nothing is purged automatically. **Delete forever** leaves a small tombstone, so other devices delete the note too.
- **Import and export**: export writes plain, unencrypted JSON (`format: "kurippu-export"`) of every note that isn't in the Trash. It leaves out whether a note is minimised. Import merges by note ID and never overwrites a note that already exists, including IDs that only remain as a tombstone, so a forever-deleted note can't come back through an old export.

Any change to the note format or the backup file format needs a compatibility plan for notes created under the old format.

## Google Drive backup

Backup is optional and off until you sign in from **Sync & backup**. Kurippu keeps one encrypted file, `kurippu-backup-v2.enc`, in the Drive **appDataFolder**. That folder is hidden from your Drive, and the extension can't see your other files. The extension talks to Google directly. Notes are not sent to us.

- **Sign-in** uses `chrome.identity.launchWebAuthFlow`, which works in every Chromium browser, including Brave (`getAuthToken` only works in Chrome). Scopes: `openid email drive.appdata`. Access tokens live only in `chrome.storage.session`.
- **Encryption**: AES-256-GCM. The key comes from PBKDF2-SHA256 (310,000 iterations) over the Google account's stable `sub` ID with a fixed app salt. There is no passphrase, so the backup is as safe as the Google account: turn on 2-Step Verification.
- **Schedule**: after every change (batched for 30 seconds), hourly, or daily. Hourly and daily backups run only when something has changed. **Back up now** runs one straight away.
- **Safe uploads**: every backup is downloaded, checked and merged with this device before upload. The upload uses Drive's ETag precondition, so if another browser changed the file first, Kurippu rereads, merges and retries instead of overwriting it.
- **Duplicate and older files**: Drive doesn't enforce unique names, so two first backups at once can create two files. Older `kurippu-backup.enc` (v1) files can also exist. Every copy is read and merged, the canonical v2 file receives the combined state, and the extra files are left in place as recovery data.
- **Restore** (**Restore from backup…**): **Add missing notes** only adds notes this device doesn't have. **Reconcile with Drive** previews additions, updates, trash changes, permanent deletions and conflict copies before you apply it.
- **Failures**: network, rate-limit and Google server errors retry with backoff, and an interrupted job resumes when the service worker wakes up. Sign-in problems, a corrupt or unsupported file, or unsafe data pause backup instead of being treated as an empty Drive.

The Drive file holds the merged current state of your notes. It is not a point-in-time history.

### Set up the OAuth client

Drive backup needs a Google OAuth client ID. Without one, **Sync & backup** says that Drive backup isn't configured, and everything else still works.

1. Load the extension unpacked and note its ID from `chrome://extensions`. The **Sync & backup** page also shows the exact redirect URI. Unpacked IDs depend on the folder path; the Chrome Web Store assigns a permanent ID.
2. In Google Cloud Console, enable the **Google Drive API**.
3. Create **Credentials → OAuth client ID → Web application** with this authorised redirect URI: `https://<extension-id>.chromiumapp.org/oauth2`
4. Set up the OAuth consent screen with the scopes listed above. `drive.appdata` is a non-sensitive scope.
5. Paste the client ID into `extension/shared/config.js` → `googleClientId`, then reload the extension.

## Permissions

Every entry in `extension/manifest.json` is there because the code uses it.

| Permission                                                                                                   | Why                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                                                                                    | Notes, settings and the sync mirror in `chrome.storage.local` and `chrome.storage.sync`.                                                                                                  |
| `unlimitedStorage`                                                                                           | Lifts the 10 MB cap on `chrome.storage.local` so a large note collection can grow.                                                                                                        |
| `contextMenus`                                                                                               | The **Add sticky note here** item.                                                                                                                                                        |
| `activeTab`                                                                                                  | Temporary access to the current tab after you open the popup, use the context menu or press the shortcut. This is what covers local `file://` pages, which are not in `host_permissions`. |
| `identity`                                                                                                   | Google sign-in for Drive backup through `chrome.identity.launchWebAuthFlow`. It returns the account's email (shown on the Sync page) and stable ID (used for the encryption key).         |
| `alarms`                                                                                                     | The batched backup after a change, plus hourly, daily and retry alarms.                                                                                                                   |
| `scripting`                                                                                                  | Injects the note engine into tabs that don't have it yet, for example after an extension update.                                                                                          |
| `http://*/*`, `https://*/*`                                                                                  | Show notes on ordinary web pages.                                                                                                                                                         |
| `https://kurippu.yush.dev/*`, `https://kurippu-510919.web.app/*`, `https://kurippu-510919.firebaseapp.com/*` | The product website origins, listed explicitly so the [presence signal](#product-site-presence) is visible in the manifest. `https://*/*` already covers them.                            |
| `https://www.googleapis.com/*`, `https://openidconnect.googleapis.com/*`, `https://oauth2.googleapis.com/*`  | Drive file calls, account info and token revoke on disconnect. `https://*/*` already covers them too.                                                                                     |

### Product-site presence

On the product website origins only, the content script tells the page that the extension is installed, so the site can greet you. The code is in `extension/content/setup.js` (`SITE_ORIGINS`, `announcePresenceToSite`).

Allowlisted origins (never `localhost` or a dev server):

- `https://kurippu.yush.dev`
- `https://kurippu-510919.web.app`
- `https://kurippu-510919.firebaseapp.com`

The content script posts once on load, and again whenever the page sends a same-window, same-origin ping `{ source: 'kurippu-extension', type: 'extension-present-ping' }`. The payload is always:

```js
{
  source: 'kurippu-extension',
  type: 'extension-present',
  version: chrome.runtime.getManifest().version
}
```

It never includes note text, note counts, other sites' URLs, sync state or Drive status. It sets no cookies and calls no remote endpoint: the signal stays in the tab. The welcome page's in-page demo does not send it.

Keep `source` and `type` stable; they are the public contract. Extra fields may be added later, and site scripts should ignore fields they don't know. `window.__kurippuLoaded` and the `<kurippu-notes>` element are implementation details, not part of the contract.

To check it by hand: load the extension unpacked, open a product origin with DevTools, listen for `message` events, and post the ping above. You should see a presence reply with the extension version. On any other site, the same ping gets no reply.

How the website listens for the signal is documented in the website repo's README under "The welcome ribbon".

### Uninstall feedback

When the extension is removed, Chrome opens `https://kurippu.yush.dev/uninstalled/` in a new tab.

`extension/background/lifecycle.js` registers that address with `chrome.runtime.setUninstallURL` every time the service worker starts, and again in `BG.onInstalled` (`BG.UNINSTALL_URL`, `BG.registerUninstallPage`). Chrome only opens the tab: the extension does not collect or send anything. The feedback form, and its `POST` to `https://api.kurippu.com/uninstall/`, belong to the website repository (see its README under "The uninstall feedback page").

To check it: load the extension unpacked, remove it on `chrome://extensions`, and Chrome should open the page. There is no API that reads the registered URL back. Load `extension/` again afterwards.

## Files

```
extension/           the folder you load unpacked
  manifest.json      MV3 manifest (the only place the version lives)
  background/        service worker: context menu, badge, sync mirror, Drive jobs, messages
  content/           in-page note engine as ordered classic scripts
  shared/            shared helpers, Markdown, storage, merge logic, Drive scripts, OAuth config
  pages/
    popup/           toolbar popup
    options/         all notes, sites, couldn't place, trash, sync & backup, import & export, help
    welcome/         first-run page with an in-memory demo
  assets/
    styles/          shared design tokens linked by every extension page
    fonts/           bundled Lora and Cormorant Garamond
    icons/           toolbar and store icons
.github/
  ISSUE_TEMPLATE/    bug report and suggestion forms
  workflows/         Create Release, and the daily website submodule bump
  dependabot.yml     weekly GitHub Actions updates
  PULL_REQUEST_TEMPLATE.md
website/             git submodule: the separate website repo
AGENTS.md            instructions for AI coding agents
CODE_OF_CONDUCT.md   Contributor Covenant 2.1
CONTRIBUTING.md      how to report bugs and open pull requests
LAUNCH_CHECKLIST.md  open items before the extension is announced
LICENSE              MIT License
SECURITY.md          how to report a vulnerability privately
THIRD_PARTY_NOTICES.md  font and icon licenses
```

The service worker, the note engine and the shared helpers are ordered classic scripts, because manifest content scripts can't use `import`. The popup, options and welcome page controls are native ES modules. The note UI runs in a closed shadow root, and fonts load as `FontFace` ArrayBuffers under private family names (`Kurippu Lora`, `Kurippu Cormorant`), so a page's CSS and CSP can't affect notes, and notes can't affect the page.

## Website submodule

`website/` is a **git submodule** pointing at the separate [`kurippu-website`](https://github.com/aayusharyan/kurippu-website) repo. It has its own README, issues, pull requests and security policy. Website work (landing page, privacy policy, live demo) belongs there, not here.

Clone with the submodule:

```
git clone --recurse-submodules https://github.com/aayusharyan/kurippu
```

If you already cloned without that flag, `website/` is empty until you run:

```
git submodule update --init
```

A submodule pins an exact commit. The **Update website submodule** workflow (`.github/workflows/update-website-submodule.yml`) runs daily, moves the pointer to the website's latest commit, and commits it if anything changed. To do it by hand:

```
git submodule update --remote website
git add website
git commit -m "chore: update website submodule"
```

## Releases

Before the first public announcement, work through [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

A release is one manual run of the **Create Release** workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)): Actions → Create Release → Run workflow, then pick `minor` or `major`. There is no patch bump, so versions are always `X.Y.0`.

The run stops at the first failure. In order, it:

1. Reads the latest `vX.Y.Z` tag and works out the next version. It fails if `extension/manifest.json` isn't at that tag's version.
2. Writes the new version to `extension/manifest.json`. The options page shows it in the sidebar.
3. Checks that the manifest is Manifest V3 with a semver version, and that the files the package needs are present.
4. Packs `kurippu-vX.Y.0.zip`: the `extension/` folder plus `LICENSE` and `THIRD_PARTY_NOTICES.md`. Markdown docs and `website/` are left out.
5. Signs the zip into `kurippu-vX.Y.0.crx` with [chrome-webstore-publish](https://github.com/puzzlers-labs/chrome-webstore-publish) (`v1`, mode `sign`). Both files are kept as a workflow artifact for 31 days.
6. Commits `chore: bump version to X.Y.0`, pushes it to `main`, then creates and pushes the `vX.Y.0` tag.
7. Publishes a GitHub Release for the tag, with the zip and the CRX attached and notes listing every commit since the previous tag.

Nothing is committed or tagged until both packages exist, so every tag is a version that produced release files. If a run fails, start it again. Two runs never overlap. Because it pushes straight to `main` with the workflow's token, branch protection on `main` must allow that.

Signing reads the `SIGNING_CRX_PRIVATE_KEY` repository secret (the PEM private key, including its begin and end lines). Always use the same key: the CRX's extension ID comes from it, so a different key means a different extension. The CRX gets the Chrome Web Store ID `gaibhdliodoodaiohhabjakiejeldikh` only when signed with the key that listing was created from.

The workflow does not publish to the Chrome Web Store. To update the listing, download the zip from the GitHub Release and upload it in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Known limitations

- Browsers block extensions on some pages, so notes can't go on `chrome://` pages, the Chrome Web Store, PDFs in the built-in viewer, or other extensions' pages.
- Notes don't appear inside iframes.
- Notes use page coordinates. On apps that scroll inside a fixed-height container, anchored notes follow their element, but notes placed only by coordinate don't scroll with the container.
- Firefox and Safari are not supported yet.
- Drive backup encryption is only as strong as the Google account: whoever can read the app folder as that account can also derive the key.

## Contributing

Contributions are welcome, from a typo fix to a bug report to a behaviour change. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. This project follows a [Code of Conduct](CODE_OF_CONDUCT.md).

To report a security problem, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

AI coding agents working on this repository should read [AGENTS.md](AGENTS.md).

## License

Released under the [MIT License](LICENSE). Bundled fonts and icons keep their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
