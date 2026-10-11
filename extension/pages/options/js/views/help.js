/* Help view: shortcuts, welcome link, motion toggle, and Markdown reference. */

import { K, esc, pageState, query, main } from '../state.js';

/** Render shortcuts, welcome/change-shortcut buttons, animations toggle, and Markdown bits. */
export async function renderShortcuts() {
  main.dataset.view = 'shortcuts';
  let cmd = '';
  try { const all = await chrome.commands.getAll(); const c = all.find((x) => x.name === 'new-note'); cmd = c && c.shortcut; } catch (e) { /* ignore */ }
  const keys = (s) => s.split('+').map((k) => `<kbd>${esc(k)}</kbd>`).join('+');
  const motion = pageState.settings.motion !== false;
  main.innerHTML = `<div class="view narrow">
    <h1 class="view-title">Help</h1>
    <dl class="keys">
      <dt>Right-click → <i>Add sticky note here</i></dt><dd>Adds a note where you clicked. If the page has its own right-click menu, Kurippu steps aside.</dd>
      <dt>${keys(K.modLabel)}+<kbd>click</kbd></dt><dd>Adds a note on any empty spot. Links, buttons and fields behave as normal.${K.isMac ? ' On a Mac, Ctrl + click is right-click, so Kurippu uses ⌘.' : ''}</dd>
      <dt>${cmd ? keys(cmd) : '<span class="muted">Not set</span>'}</dt><dd>Adds a note in the middle of the page - no mouse needed.</dd>
      <dt>${keys(K.modLabel)}+<kbd>↵</kbd>, or click <i>Preview</i></dt><dd>Shows the preview. A note stays in edit until you do this, and a refresh keeps that choice.</dd>
      <dt>Click <i>Edit</i>, or double-click a note</dt><dd>Opens it for editing. That choice is saved with the note.</dd>
    </dl>
    <div class="btn-row">
      <button class="btn" id="change">Change keyboard shortcuts</button>
      <button class="btn" id="welcome">Open welcome page</button>
    </div>
    <div class="rule"></div>
    <div class="section">
      <div class="section-label"><h2 class="section-title">Note animations</h2><div class="section-sub">Saved on this device only. Applies on web pages and the welcome page. Always off when your system asks for reduced motion.</div></div>
      <div class="section-body">
        <div class="status-line"><span>${motion ? 'On · notes pop in, sway as you drag them, drop to a chip, spring open and fade out' : 'Off · notes appear, move and disappear instantly'}</span>
          <button class="switch" id="motion" role="switch" aria-checked="${motion}" aria-label="Note animations"></button></div>
      </div>
    </div>
    <div class="rule"></div>
    <div class="md-help">
      <h2 class="section-title">Markdown</h2>
      <p class="section-sub">Type these in a note - Preview renders them live. Nothing fancier is needed.</p>
      <ul class="md-bits">
        <li><code># ## ###</code> headings</li>
        <li><code>**bold**</code></li>
        <li><code>*italic*</code> or <code>_italic_</code></li>
        <li><code>~~strike~~</code></li>
        <li><code>\`code\`</code></li>
        <li><code>[label](https://…)</code> links</li>
        <li><code>- item</code> bullets</li>
        <li><code>1. item</code> numbered</li>
        <li><code>- [ ]</code> / <code>- [x]</code> tasks</li>
        <li><code>&gt; quote</code></li>
        <li><code>#tag</code></li>
        <li><code>---</code> rule</li>
      </ul>
    </div>
  </div>`;
  query('#change').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  /* Same first-run page as on install, for people who want a refresher. */
  query('#welcome').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('pages/welcome/welcome.html') });
  query('#motion').onclick = async () => { await K.store.patchSettings({ motion: !motion }); };
}
