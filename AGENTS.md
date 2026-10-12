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

### 2. Don't invent or commit a real OAuth client ID

`extension/shared/config.js` → `googleClientId` is configuration. An OAuth client ID is not secret by itself, but treat the file as a placeholder the user fills in locally. Don't invent a real value or commit one on the user's behalf.

### 3. Keep the privacy promise

**The extension has no analytics.** No analytics, trackers, tracking pixels, crash reporters, or ads, and nothing phones home except the user's own explicit Google Drive backup (see README → "Google Drive backup"). Never add telemetry, error reporting, a new remote endpoint, or a dependency that does any of this. If a change would make the extension talk to a new domain, stop and ask first. This promise is the whole reason the companion site's copy and privacy policy can say what they say; breaking it here breaks a claim made somewhere else.

The product-site presence signal (see README → "Product-site presence") posts only `{ source, type, version }` on the allowlisted product origins, in-tab via `postMessage`. Never widen the payload or the origin list without updating that README section.

### 4. `website/` is a separate repository

`website/` is a **git submodule** pointing at [`kurippu-website`](https://github.com/aayusharyan/kurippu-website), a full-fledged repo with its own README, `AGENTS.md`, issues, security policy and history. Don't edit files under `website/` while working on the extension, and don't carry extension conventions (or these rules) into it. If a task is actually about the marketing site, say so and point the user at that repo, or follow its own `AGENTS.md` if you are invoked from inside it.

### 5. Stay in scope

- Make the change that was asked for, and no more. Don't reformat or refactor unrelated code.
- **No build step by design.** This is plain JavaScript, loaded as-is by the browser (see README). Don't introduce a bundler, transpiler, framework, or `npm` dependency without asking: the extension has no `package.json` (the `website/` submodule may have its own), and adding one for the extension is a decision for the user to make, not you.
- Don't invent facts about what the extension does (permissions, shortcuts, sync behaviour, limits). If you aren't sure, check `extension/manifest.json` and the README, or ask.
- Don't change the shadow-DOM isolation, the anchor/fallback placement logic, or the storage/sync/backup merge behaviour as a side effect of an unrelated change: these are deliberate and documented in README, under "How notes find their place again", "Storage and sync" and "Google Drive backup".

### 6. Do not use em dashes

**Never write an em dash (U+2014)** anywhere: code, comments, documentation, commit messages (if you are asked to write any) or your replies to the user. Use a hyphen, comma, colon, parentheses, or a full stop instead.

### 7. Keep the code human-readable (FOSS)

This is a **FOSS** repository. People read and change this code, so write for humans first.

- Use clear, descriptive names for variables, functions and files. Prefer obvious words over clever abbreviations.
- Keep code organized: related logic together, small focused functions, a structure a new contributor can follow without a tour.
- When readability and a dense one-liner conflict, and the cost is not a real performance problem, prefer the readable form. Named functions beat opaque one-line lambdas or arrow chains that hide intent.
- Dense style is fine only where the surrounding code already uses it for a clear reason (for example a trivial callback), or where a tighter form is needed for a measured hot path. Default to clarity.

## Project snapshot

A Manifest V3 Chromium extension that lets you leave Markdown sticky notes on any web page, anchored so they come back where you left them, synced via `chrome.storage` and optionally backed up (encrypted) to the user's own Google Drive.

- **Stack:** plain JavaScript, no build step, no framework, no bundler. Manifest V3 service worker + content script.
- **No tests and no linter.** There is nothing to run to verify a change beyond loading the extension and exercising it by hand.
- `website/` (git submodule, see rule 4) is the separate marketing site repo and is out of scope here.

## Where things live

| To change… | Look in… |
| --- | --- |
| Manifest, permissions, content-script matches | `extension/manifest.json` |
| Why each permission is declared | README → "Permissions" |
| Context menu, badge, sync mirror, backup alarms, message routing (ordered classic scripts; `background.js` is the thin entry) | `extension/background/` (`lifecycle.js` … `listeners.js`, entry `background.js`) |
| In-page note engine: shadow DOM, anchoring, edit/preview, drag, swing animations (ordered classic scripts; `content.js` is the thin bootstrap) | `extension/content/` (`setup.js` … `fonts.js`, bootstrap `content.js`) |
| Product-site presence announce (allowlisted origins, `postMessage` payload) | `extension/content/setup.js` (`SITE_ORIGINS`, `announcePresenceToSite`); contract in README → "Product-site presence" |
| Colors, Markdown, time, note reconciliation, storage, note CSS, icons (ordered classic scripts; `shared.js` assembles `Kurippu`) | `extension/shared/` (`constants.js` … `shared.js`) |
| Google Drive OAuth, AES-GCM encryption, Drive `appDataFolder` calls (ordered classic scripts; `drive.js` assembles `KurippuDrive`) | `extension/shared/` (`drive-auth.js` … `drive.js`) |
| Google OAuth client ID | `extension/shared/config.js` (don't invent or commit a real value) |
| Toolbar popup. Page CSS in `popup.css`; native modules under `js/`, same shape as options | `extension/pages/popup/` |
| Options page: all notes, sites, couldn't-place, trash, sync & backup, import/export, Help (shortcuts, welcome link, animations), sidebar version. Page CSS in `options.css`; modules under `js/` | `extension/pages/options/` |
| First-run welcome page. Page CSS in `welcome.css`; `demo.js` is a classic script so the flag exists before the note engine; the page controls are `js/main.js` | `extension/pages/welcome/` |
| Design-system tokens and shared page styles (linked by every extension page before its own CSS) | `extension/assets/styles/` |
| Bundled fonts (SIL OFL) | `extension/assets/fonts/` |
| Toolbar and store icons | `extension/assets/icons/` |
| MIT License | `LICENSE` |
| Font and icon third-party notices | `THIRD_PARTY_NOTICES.md` |
| How humans contribute (issues, PRs, principles) | `CONTRIBUTING.md` |
| Code of Conduct (Contributor Covenant 2.1) | `CODE_OF_CONDUCT.md` |
| Private vulnerability reporting | `SECURITY.md` |
| Open items before announcing the extension | `LAUNCH_CHECKLIST.md` |
| Issue / PR templates, Dependabot, Actions (including Create Release) | `.github/` |
| Marketing site (separate repo, see rule 4) | `website/` |

## Conventions

- Match the surrounding code's style; there's no formatter or linter enforcing one.
- Two loading styles, one reason: extension page UI (`options`, `popup`, and the welcome controls) uses native ES modules under each page's `js/`. Those pages still load the ordered classic shared chain first (and welcome also loads the full content-script chain for the in-page demo). The service worker, shared helpers, Drive, and the in-page engine use ordered classic scripts, because manifest content scripts cannot `import`. Do not add a bundler to force one syntax. Keep each classic-script list in the same order everywhere it is loaded.
- The note UI runs inside a closed shadow root specifically so a host page's CSS/CSP can't reach it and notes can't leak into the page. Don't weaken that isolation to make a feature easier.
- Fonts load as `FontFace` ArrayBuffers under private family names (see README → "Files"); don't switch them to a stylesheet `@font-face` or a Google Fonts request.
- Storage changes must go through the same `chrome.storage.local` → `chrome.storage.sync` mirroring path described in README → "Storage and sync"; don't write directly to one and skip the other.
- Any change to the note anchor/fallback/placement format or the backup file format needs a compatibility plan for notes created under the old format. Say so explicitly if a change touches this.

## Keep docs in sync

- Update `README.md` when you change commands, structure, permissions, user-facing behaviour, or the release process, and update this file when you change the rules or layout above.
- Extension releases go through `.github/workflows/release.yml` (manual **Create Release**). The same run signs the packed zip into a CRX and attaches the zip and the CRX to the GitHub Release. It does not publish to the Chrome Web Store. Version lives in `extension/manifest.json` only; the extension has no `package.json`. Don't invent a parallel version field elsewhere.
- `extension/manifest.json`'s `permissions` and `host_permissions` must stay truthful to what the code actually does; add or remove a permission there in the same change that starts or stops needing it.

## Reporting back

When you finish, say what you changed and which files, how you checked it (loaded the extension unpacked and exercised the specific flow; there is no automated check), and anything you could not verify. Mention that you made no git changes, and leave committing to the user.
