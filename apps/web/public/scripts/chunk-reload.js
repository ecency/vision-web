/**
 * ChunkLoadError auto-recovery.
 *
 * During deployments, old JS chunks are replaced with new ones. Users with
 * stale HTML references will get 404/502 for old chunks. This script detects
 * those failures and auto-reloads the page (max 2 times per minute to avoid
 * infinite loops).
 *
 * Must load BEFORE React — chunk errors can prevent React from booting.
 */
(function () {
  var KEY = "__chunk_reload";
  var MAX_RELOADS = 2;
  var WINDOW_MS = 60000;

  var PARAM = "_cr";

  function tryReload() {
    try {
      var raw = sessionStorage.getItem(KEY);
      var data = raw ? JSON.parse(raw) : { count: 0, ts: 0 };
      var now = Date.now();
      if (now - data.ts > WINDOW_MS) data.count = 0;
      if (data.count >= MAX_RELOADS) return;
      data.count++;
      data.ts = now;
      sessionStorage.setItem(KEY, JSON.stringify(data));
      window.location.reload();
    } catch (e) {
      // sessionStorage unavailable — fall back to URL parameter guard
      if (window.location.search.indexOf(PARAM + "=1") !== -1) return;
      var sep = window.location.search ? "&" : "?";
      window.location.replace(window.location.href + sep + PARAM + "=1");
    }
  }

  // Catch <script> and <link> elements failing to load Next.js assets
  window.addEventListener(
    "error",
    function (event) {
      var el = event.target;
      if (el && (el.tagName === "SCRIPT" || el.tagName === "LINK")) {
        tryReload();
      }
    },
    true
  );

  // Catch dynamic import failures (ChunkLoadError from webpack/Next.js)
  window.addEventListener("unhandledrejection", function (event) {
    var msg = "";
    try {
      msg = (
        (event.reason && event.reason.message) ||
        String(event.reason)
      ).toLowerCase();
    } catch (e) {
      return;
    }
    if (
      msg.indexOf("chunkloaderror") !== -1 ||
      msg.indexOf("loading chunk") !== -1 ||
      msg.indexOf("loading css chunk") !== -1 ||
      msg.indexOf("failed to fetch dynamically imported module") !== -1
    ) {
      event.preventDefault();
      tryReload();
    }
  });
})();
