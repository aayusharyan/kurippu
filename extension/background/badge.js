/* Toolbar badge text and couldn't-place placement tracking.
   Owns the single placementQueue singleton for this worker. */
(function (root) {
  'use strict';

  const BG = root.__KurippuBackground;
  const K = root.Kurippu;
  if (!BG) throw new Error('Background lifecycle missing: load lifecycle.js before badge.js');

  let placementQueue = Promise.resolve();

  /** Show the note count on the toolbar badge, with a dot for unplaced notes. */
  BG.setBadge = function setBadge(tabId, tabStatus) {
    const dot = tabStatus.unplaced && tabStatus.unplaced.length ? '•' : '';
    const text = tabStatus.hidden ? '' : (tabStatus.count ? String(tabStatus.count) : '') + dot;
    chrome.action.setBadgeText({ tabId, text }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#2d2b2b' }).catch(() => {});
    if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' }).catch(() => {});
  };

  /** Remember which notes couldn't be placed last time their page was open. */
  BG.recordPlacement = function recordPlacement(placementReport) {
    placementQueue = placementQueue.then(async () => {
      const cur = await K.store.placement();
      const next = { ...cur };
      (placementReport.ok || []).forEach((id) => delete next[id]);
      (placementReport.lost || []).forEach((id) => { next[id] = 'lost'; });
      (placementReport.unplaced || []).forEach((id) => { next[id] = 'unplaced'; });
      if (JSON.stringify(next) !== JSON.stringify(cur)) await chrome.storage.local.set({ placement: next });
    }).catch(() => {});
  };
})(self);
