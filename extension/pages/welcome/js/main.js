/* First-run page controls: platform shortcut labels, the Drive link, and close. */

const K = window.Kurippu;

/** Fill the shortcut labels for this platform. */
function fillShortcutLabels() {
  document.querySelectorAll('.mod').forEach((el) => { el.textContent = K.modLabel; });
  if (K.isMac) document.getElementById('macline').textContent = 'Ctrl + click is right-click on a Mac, so it’s ⌘ + click. ';
}

/** Wire the Drive backup link and the button that closes this tab. */
function bindActions() {
  document.getElementById('drive').innerHTML = K.icon('lock', 14) + 'Set up Drive backup';
  document.getElementById('go').onclick = async () => {
    const tab = await chrome.tabs.getCurrent();
    if (tab) chrome.tabs.remove(tab.id); else window.close();
  };
}

fillShortcutLabels();
bindActions();
