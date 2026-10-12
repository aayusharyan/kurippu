# Security policy

## Scope

This repository is the Kurippu **browser extension**: a Manifest V3 Chromium extension that stores Markdown sticky notes locally, optionally mirrors them through browser sync, and can encrypt a backup into the signed-in user's own Google Drive `appDataFolder`. Reports about it are welcome, for example:

- Cross-site scripting or other injection via note Markdown, the shadow-DOM note UI, or content-script placement on a host page.
- Ways to read or change another user's notes, sync data, or Drive backup without their account.
- Weaknesses in the OAuth flow, token handling, or AES-GCM backup encryption described in the README.
- Privilege escalation through extension permissions, message passing, or `host_permissions`.
- Exposed secrets or credentials in the repository (real OAuth client IDs, tokens).

The Kurippu **website** (landing page and privacy policy) is maintained in a separate repository: [kurippu-website](https://github.com/aayusharyan/kurippu-website). If you've found a vulnerability there, please report it following that repo's [SECURITY.md](https://github.com/aayusharyan/kurippu-website/blob/main/SECURITY.md).

## Supported versions

Only the latest code on the `main` branch is supported. Fixes are not backported.

## Reporting a vulnerability

**Please don't open a public issue or pull request for a security problem.**

Email **hello@yush.dev** with:

- A description of the problem and why it matters.
- Steps to reproduce it, or a proof of concept.
- The file, commit or extension version involved, and your browser and version if it's relevant.

We'll do our best to reply promptly, keep you informed while we investigate, tell you when it's fixed, and credit you if you'd like. We ask that you give us a reasonable chance to fix the issue before you disclose it publicly.

## Good-faith research

We won't take action against anyone who finds and reports an issue in good faith, avoids harming other people, and doesn't access or change data that isn't theirs. Please test against a local unpacked build of this repository rather than other people's browsers or accounts, and don't run denial-of-service tests against Google APIs or production infrastructure.
