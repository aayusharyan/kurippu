/* Registers every chrome.* listener for the service worker.
   Loaded last so all feature handlers already exist on the private namespace.
   Keeps message sender checks and async reply return-true behavior. */
(function (root) {
  'use strict';

  const BG = root.__KurippuBackground;
  if (!BG || !BG.commitMutation || !BG.runDrive || !BG.openNote) {
    throw new Error('Background features missing: load feature scripts before listeners.js');
  }

  chrome.runtime.onInstalled.addListener(BG.onInstalled);
  chrome.runtime.onStartup.addListener(BG.onStartup);

  chrome.contextMenus.onClicked.addListener(BG.onContextMenuClicked);
  chrome.commands.onCommand.addListener(BG.onCommand);

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || typeof msg !== 'object' || sender.id !== chrome.runtime.id) return;
    const tabId = sender.tab && sender.tab.id;
    switch (msg.type) {
      case 'status':
        if (tabId != null) BG.setBadge(tabId, msg);
        BG.recordPlacement(msg);
        return;
      case 'content-ready':
        if (tabId == null) return;
        BG.takePendingJump(tabId).then((id) => reply({ jump: id }));
        return true;
      case 'open-note':
        BG.openNote(msg.id).then(() => reply({ ok: true }));
        return true;
      case 'to-tab':
        chrome.tabs.get(msg.tabId).then((tab) => BG.toTab(tab, msg.msg)).then((r) => reply(r || null), () => reply(null));
        return true;
      case 'sync-now':
        BG.reconcileSync().then(() => reply({ ok: true }));
        return true;
      case 'drive':
        BG.runDrive(msg.op).then(reply, (e) => reply({ error: e.message || String(e), code: e.code || 'error' }));
        return true;
      case 'store-mutation':
        BG.commitMutation(msg).then((result) => reply(result), (e) => reply({ error: e.message || String(e) }));
        return true;
    }
  });

  chrome.tabs.onRemoved.addListener(BG.onTabRemoved);
  chrome.storage.onChanged.addListener(BG.onStorageChanged);
  chrome.alarms.onAlarm.addListener(BG.onAlarm);

  delete root.__KurippuBackground;
})(self);
