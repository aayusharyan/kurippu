/* Install/startup helpers, the uninstall page, and on-demand content-script injection.
   Talks to tabs (and the welcome page) once the content script is present.
   First feature script in the background classic-script chain. */
(function (root) {
  'use strict';

  const BG = root.__KurippuBackground = root.__KurippuBackground || {};
  const K = root.Kurippu;

  BG.WELCOME = chrome.runtime.getURL('pages/welcome/welcome.html');

  /* Page Chrome opens after removal. The form on that page sends the answers; this extension does not. */
  BG.UNINSTALL_URL = 'https://kurippu.yush.dev/uninstalled/';

  /** Register the uninstall page so a removal opens it in a new tab. */
  BG.registerUninstallPage = function registerUninstallPage() {
    chrome.runtime.setUninstallURL(BG.UNINSTALL_URL);
  };

  /** Inject the content script into every open page that can hold notes. */
  BG.injectOpenTabs = async function injectOpenTabs() {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !K.canNote(tab.url || '')) continue;
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: BG.CONTENT_INJECT_FILES }); }
      catch (e) { /* this page does not allow injection */ }
    }
  };

  /** Send a message to a tab, injecting the content script first when needed. */
  BG.toTab = async function toTab(tab, msg) {
    if (!tab || tab.id == null) return;
    if (tab.url && tab.url.startsWith(BG.WELCOME)) {
      chrome.runtime.sendMessage({ ...msg, target: 'welcome' }).catch(() => {});
      return;
    }
    try {
      return await chrome.tabs.sendMessage(tab.id, msg);
    } catch (e) {
      if (!K.canNote(tab.url || '')) return;
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: BG.CONTENT_INJECT_FILES });
        await new Promise((r) => setTimeout(r, 250));
        return await chrome.tabs.sendMessage(tab.id, msg);
      } catch (e2) { /* restricted page */ }
    }
  };

  /** Create the context menu and run install/update side effects. */
  BG.onInstalled = async function onInstalled({ reason }) {
    BG.registerUninstallPage();
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: 'add-note', title: 'Add sticky note here', contexts: ['page', 'selection', 'image', 'video', 'frame'] });
    });
    if (reason === 'install') chrome.tabs.create({ url: BG.WELCOME });
    // Reloading replaces the script on tabs that are already open, which otherwise keep the previous copy.
    if (reason === 'update') BG.injectOpenTabs();
    await BG.reconcileSync();
    await BG.ensurePeriodicAlarm();
  };

  /** Resume Drive jobs and refresh sync/alarms after a browser restart. */
  BG.onStartup = async function onStartup() {
    await BG.recoverDriveJob();
    await BG.reconcileSync();
    await BG.ensurePeriodicAlarm();
  };

  /** Handle the "Add sticky note here" context menu item. */
  BG.onContextMenuClicked = function onContextMenuClicked(info, tab) {
    if (info.menuItemId === 'add-note') BG.toTab(tab, { type: 'add-at-context' });
  };

  /** Handle the keyboard command that creates a note on the active tab. */
  BG.onCommand = async function onCommand(cmd) {
    if (cmd !== 'new-note') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    BG.toTab(tab, { type: 'new-note' });
  };

  // Every worker start, so a later wake keeps the same page registered.
  BG.registerUninstallPage();
})(self);
