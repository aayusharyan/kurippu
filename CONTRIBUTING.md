# Contributing to Kurippu

Thanks for taking the time to help. This repository is the Kurippu **browser extension**. Fixes and improvements of every size are welcome: bugs, anchoring quirks, accessibility, docs, and small UI polish.

By taking part you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** or **suggest an improvement** by opening an issue. Search existing issues first.
- **Fix something small** (typo, copy, obvious bug) by opening a pull request directly.
- **Propose something bigger** (new behaviour, storage format changes, a dependency, a new remote endpoint) by opening an issue first, so we can agree on the approach before you spend time on it.
- **Report a security or privacy problem** privately, following [SECURITY.md](SECURITY.md). Please don't open a public issue for it.

Questions about the **marketing website** (landing page, privacy policy, live demo) belong in [kurippu-website](https://github.com/aayusharyan/kurippu-website). The `website/` folder here is only a git submodule pointer to that repo.

## Setting up

You need a Chromium-based browser (Chrome, Brave, Edge, and so on). There is no build step and the extension has no `package.json`.

```sh
git clone --recurse-submodules https://github.com/aayusharyan/kurippu.git
cd kurippu
```

1. Open `chrome://extensions` (or the equivalent in your browser) and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `extension/` folder (the one that contains `manifest.json`).
3. The welcome page opens. Exercise your change there, or on any ordinary web page.

[README.md](README.md) describes behaviour, storage, sync, Drive backup and the file layout. Reload the extension from `chrome://extensions` after you edit source files.

Google Drive backup needs a Google OAuth client ID in `extension/shared/config.js` (see README → "Set up the OAuth client"). Everything else works without it.

## Project principles

These are the rules the extension is built around. Pull requests that break one will be asked to change.

1. **Keep the privacy promise.** The extension has no analytics, trackers, crash reporters or ads. Nothing phones home except the user's own explicit Google Drive backup. Don't add telemetry, error reporting, a new remote endpoint, or a dependency that does any of that. If a change would make the extension talk to a new domain, open an issue first.
2. **No build step.** Plain JavaScript, loaded as-is by the browser. Don't introduce a bundler, transpiler, framework or npm dependency without agreeing it in an issue first.
3. **Keep shadow-DOM isolation.** Notes run inside a closed shadow root so host-page CSS and CSP can't reach them, and notes can't leak into the page. Don't weaken that to make a feature easier.
4. **Respect storage and sync.** Writes must follow the `chrome.storage.local` → `chrome.storage.sync` mirroring path described in the README. Don't write to one and skip the other.
5. **Anchor and backup formats are compatibility-sensitive.** Changes to note placement fields or the Drive backup file format need a plan for notes created under the old format. Say so in the pull request.
6. **Respect reduced motion.** Animations already honour `prefers-reduced-motion`; keep that working.
7. **Don't commit a real Google OAuth client ID.** Leave `extension/shared/config.js` as a placeholder unless you are setting up your own local client for Drive backup testing.

## Code style

There is no formatter or linter. Match the code around you.

- Two-space indentation, single quotes where the nearby file uses them, LF line endings. [`.editorconfig`](.editorconfig) covers the basics.
- Give non-trivial functions a short comment explaining what they do, and use comments to explain **why**, not to restate what the code does.
- Prefer small, focused pull requests over sweeping refactors mixed with behaviour changes.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Make your change, keeping the pull request focused on one thing.
3. Load the extension unpacked and exercise the specific flow you changed (add, edit, drag, delete, sync page, import/export, and so on). There is no automated test suite.
4. If you changed user-facing behaviour, permissions or the file layout, update [README.md](README.md) in the same pull request.
5. Open a pull request using the template. Describe what changed and why.

Commit messages should have a short, imperative subject line ("Fix note re-pin after SPA navigation"), with detail in the body if it helps. Smaller commits are easier to review.

## Adding assets and dependencies

- **Fonts, icons, images:** only add material whose license allows redistribution, and record its copyright notice and required license text in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Fonts must stay self-hosted as `FontFace` ArrayBuffers under private family names (see README → "Files"); don't switch them to a stylesheet `@font-face` or a Google Fonts request.
- **New libraries or remote services:** open an issue first. Adding a package manager or a new network dependency is a project decision, not something to sneak into a feature pull request.

## Licensing of contributions

This project is released under the [MIT License](LICENSE). By submitting a contribution you confirm that you have the right to do so, and you agree that it is licensed under the same terms.

## AI-assisted contributions

Using an AI coding tool is fine. You remain responsible for everything you submit: read and understand the change, try it in a browser yourself, and don't open pull requests you haven't reviewed. Agents working in this repository should follow [AGENTS.md](AGENTS.md).

## Getting your pull request merged

A maintainer will review it as time allows. Expect questions and requests for changes, which are a normal part of the process and not a judgment on you. Once it's approved, it will be merged.
