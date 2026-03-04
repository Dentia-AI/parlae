/**
 * Content script (ISOLATED world, document_start).
 * Bridges postMessage events from page-capture.js (MAIN world) to the
 * background service worker via chrome.runtime.sendMessage.
 */
(function () {
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== '__CONSOLE_CAPTURE__') return;

    try {
      chrome.runtime.sendMessage({
        type: 'log_entry',
        entry: event.data.entry,
        url: window.location.href,
      });
    } catch (_) {
      // Extension context may have been invalidated (e.g. extension reloaded)
    }
  });
})();
