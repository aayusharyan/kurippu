/* Toolbar popup entry. Paints controls, loads footer status, then either
   lists notes for the active page or explains that the page is restricted. */

import { bindNavigation, paintIcons } from './controls.js';
import { renderFooter } from './footer.js';
import { showPageNotes } from './notes.js';
import { byId } from './dom.js';

const K = window.Kurippu;

paintIcons(K);
bindNavigation();
renderFooter(K);

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const page = tab && K.pageKey(tab.url || '');
if (!page) byId('cannot').hidden = false;
else await showPageNotes(K, tab, page);
