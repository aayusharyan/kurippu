# AGENTS.md

Instructions for AI coding agents working in this repository, whichever tool or model you are. Humans should start with [README.md](README.md); this file adds what an agent needs on top of it.

## Hard rules

### 1. Do not run git commands

**Never run any `git` command unless the user explicitly asks you to, in the current conversation.** This covers read-only commands (`git status`, `git diff`, `git log`, `git show`, `git blame`) as well as anything that changes state (`add`, `commit`, `push`, `pull`, `fetch`, `checkout`, `switch`, `restore`, `reset`, `revert`, `rebase`, `merge`, `stash`, `branch`, `tag`, `clean`, `rm`, `mv`, `worktree`, `submodule`, and so on).

- If the user does ask, run only what they asked for. Permission to commit is not permission to push, and permission given earlier in a session does not carry over to a new task.
- Don't reach the same result by another route: the `gh` CLI for branch, PR or repository operations, IDE or GUI git integrations, or scripts and hooks that wrap git.
- Don't read, edit or delete anything inside `.git/`.
- Leave your work uncommitted in the working tree. In your final message, list the files you created, changed and deleted so the user can review them and use git themselves.
- If a task seems to need git (for example "see what changed"), work from the files instead, or ask the user.

### 2. Never touch the signing keys or secrets

`kurippu-private.pem`, `kurippu-public.pem` and `kurippu-public.b64` at the repo root sign the packaged extension (`dist/kurippu-*.crx`). Never read their contents into a reply, print them, copy them elsewhere, upload them anywhere, or stage them for commit. The same goes for any real value placed in `lib/config.js` → `googleClientId` (an OAuth client ID is not secret by itself, but treat the file as configuration, not something to invent or commit a real value into on the user's behalf) and for `dist/`, which is a build output, not source: don't hand-edit anything under it.

### 3. Keep the privacy promise

**The extension has no analytics.** No analytics, trackers, tracking pixels, crash reporters, or ads, and nothing phones home except the user's own explicit Google Drive backup (see README → "Google Drive backup"). Never add telemetry, error reporting, a new remote endpoint, or a dependency that does any of this. If a change would make the extension talk to a new domain, stop and ask first. This promise is the whole reason the companion site's copy and privacy policy can say what they say; breaking it here breaks a claim made somewhere else.

### 4. `website/` is a separate repository

`website/` is a **git submodule** pointing at [`kurippu-website`](https://github.com/aayusharyan/kurippu-website), a full-fledged repo with its own README, `AGENTS.md`, issues, security policy and history. Don't edit files under `website/` while working on the extension, and don't carry extension conventions (or these rules) into it. If a task is actually about the marketing site, say so and point the user at that repo, or follow its own `AGENTS.md` if you are invoked from inside it.

### 5. Stay in scope

- Make the change that was asked for, and no more. Don't reformat or refactor unrelated code.
- **No build step by design.** This is plain JavaScript, loaded as-is by the browser (see README). Don't introduce a bundler, transpiler, framework, or `npm` dependency without asking: there is currently no `package.json`, and adding one is a decision for the user to make, not you.
- Don't invent facts about what the extension does (permissions, shortcuts, sync behaviour, limits). If you aren't sure, check `manifest.json` and the README, or ask.
- Don't change the shadow-DOM isolation, the anchor/fallback placement logic, or the storage/sync/backup merge behaviour as a side effect of an unrelated change: these are deliberate and documented in README, under "How notes find their place again", "Storage and sync" and "Google Drive backup".

### 6. Do not use em dashes

**Never write an em dash (U+2014)** anywhere: code, comments, documentation, commit messages (if you are asked to write any) or your replies to the user. Use a hyphen, comma, colon, parentheses, or a full stop instead.

## Project snapshot

A Manifest V3 Chromium extension that lets you leave Markdown sticky notes on any web page, anchored so they come back where you left them, synced via `chrome.storage` and optionally backed up (encrypted) to the user's own Google Drive.

- **Stack:** plain JavaScript, no build step, no framework, no bundler. Manifest V3 service worker + content script.
- **No tests and no linter.** There is nothing to run to verify a change beyond loading the extension and exercising it by hand.
- `website/` (git submodule, see rule 4) is the separate marketing site repo and is out of scope here.

## Where things live

| To change… | Look in… |
| --- | --- |
| Manifest, permissions, content-script matches | `manifest.json` |
| Context menu, badge, sync mirror, backup alarms, message routing | `background.js` |
| In-page note engine: shadow DOM, anchoring, edit/preview, drag, swing animations, hints, toasts | `content.js` |
| Colors, Markdown renderer, storage helpers, icons, shared note CSS | `lib/shared.js` |
| Google Drive OAuth, AES-GCM encryption, Drive `appDataFolder` calls | `lib/drive.js` |
| Google OAuth client ID | `lib/config.js` (don't invent or commit a real value) |
| Toolbar popup (screen 04) | `popup.html`, `popup.js` |
| Options page: all notes, sites, couldn't-place, trash, sync & backup, import/export, shortcuts, animations toggle | `options.html`, `options.js` |
| First-run welcome page and its demo | `welcome.html`, `welcome.js` |
| Design-system tokens and page styles | `styles/` |
| Bundled fonts (SIL OFL) | `fonts/` |
| Toolbar and store icons | `icons/` |
| MIT License | `LICENSE` |
| Font and icon third-party notices | `THIRD_PARTY_NOTICES.md` |
| How humans contribute (issues, PRs, principles) | `CONTRIBUTING.md` |
| Code of Conduct (Contributor Covenant 2.1) | `CODE_OF_CONDUCT.md` |
| Private vulnerability reporting | `SECURITY.md` |
| Packaged build output (don't hand-edit) | `dist/` |
| Issue / PR templates, Dependabot, Actions | `.github/` |
| Marketing site (separate repo, see rule 4) | `website/` |

## Conventions

- Match the surrounding code's style; there's no formatter or linter enforcing one.
- The note UI runs inside a closed shadow root specifically so a host page's CSS/CSP can't reach it and notes can't leak into the page. Don't weaken that isolation to make a feature easier.
- Fonts load as `FontFace` ArrayBuffers under private family names (see README → "Files"); don't switch them to a stylesheet `@font-face` or a Google Fonts request.
- Storage changes must go through the same `chrome.storage.local` → `chrome.storage.sync` mirroring path described in README → "Storage and sync"; don't write directly to one and skip the other.
- Any change to the note anchor/fallback/placement format or the backup file format needs a compatibility plan for notes created under the old format. Say so explicitly if a change touches this.

## Keep docs in sync

- Update `README.md` when you change commands, structure, permissions, or user-facing behaviour, and update this file when you change the rules or layout above.
- `manifest.json`'s `permissions` and `host_permissions` must stay truthful to what the code actually does; add or remove a permission there in the same change that starts or stops needing it.

## Reporting back

When you finish, say what you changed and which files, how you checked it (loaded the extension unpacked and exercised the specific flow; there is no automated check), and anything you could not verify. Mention that you made no git changes, and leave committing to the user.
