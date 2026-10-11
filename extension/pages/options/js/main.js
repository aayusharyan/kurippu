/* Options page entry: inject CSS and version, watch storage, wire the router,
   and paint the first view. Sole type=module script after shared scripts load. */

import { load, syncExtras, initChrome, watchStorage } from './state.js';
import { render } from './render.js';
import { route, initRouter } from './router.js';

initChrome();
watchStorage(render);
initRouter();

/** Load data, then route from the current hash. */
(async function boot() {
  await Promise.all([load(), syncExtras()]);
  route();
})();
