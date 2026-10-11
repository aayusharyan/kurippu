/* Sets the in-memory demo flag before the note engine loads.
   Lives next to this page as a classic script, not under js/: that folder
   is for ES modules, which are deferred and would run after the engine
   had already started without reading this flag. */
window.KURIPPU_DEMO = true;
