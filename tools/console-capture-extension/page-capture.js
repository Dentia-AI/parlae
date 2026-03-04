/**
 * Injected into the page's MAIN world at document_start.
 * Monkey-patches console methods, captures uncaught errors / unhandled
 * rejections, and forwards everything to the content-bridge via postMessage.
 *
 * Re-entrant safe: if the script is injected twice on the same page
 * (e.g. registered content script + manual executeScript), the second
 * invocation is a no-op.
 */
(function () {
  if (window.__CONSOLE_CAPTURE_ACTIVE__) return;
  window.__CONSOLE_CAPTURE_ACTIVE__ = true;

  var bootTime = performance.now();
  var navStart = performance.timeOrigin || Date.now() - bootTime;

  function elapsed() {
    return '+' + (performance.now() - bootTime).toFixed(1) + 'ms';
  }

  function safe(val) {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (val instanceof Error) {
      return (val.name || 'Error') + ': ' + val.message + (val.stack ? '\n' + val.stack : '');
    }
    if (typeof val === 'symbol') return val.toString();
    if (typeof val === 'function') return '[Function: ' + (val.name || 'anonymous') + ']';
    if (val instanceof HTMLElement) return val.outerHTML.slice(0, 200);
    if (typeof val === 'object') {
      try {
        var seen = new WeakSet();
        return JSON.stringify(val, function (_k, v) {
          if (typeof v === 'object' && v !== null) {
            if (seen.has(v)) return '[Circular]';
            seen.add(v);
          }
          return v;
        }, 2);
      } catch (_) {
        return String(val);
      }
    }
    return String(val);
  }

  function serialize(args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) parts.push(safe(args[i]));
    return parts.join(' ');
  }

  function send(entry) {
    try {
      window.postMessage({ type: '__CONSOLE_CAPTURE__', entry: entry }, '*');
    } catch (_) {
      // postMessage can fail in torn-down frames
    }
  }

  // --- Override console methods ---
  var methods = ['log', 'warn', 'error', 'info', 'debug', 'trace'];
  var originals = {};

  methods.forEach(function (method) {
    originals[method] = console[method];
    console[method] = function () {
      var args = Array.prototype.slice.call(arguments);
      send({
        time: new Date().toISOString(),
        elapsed: elapsed(),
        level: method.toUpperCase(),
        message: serialize(args),
        source: 'console.' + method,
      });
      originals[method].apply(console, args);
    };
  });

  // --- Uncaught errors ---
  window.addEventListener('error', function (event) {
    send({
      time: new Date().toISOString(),
      elapsed: elapsed(),
      level: 'UNCAUGHT_ERROR',
      message:
        (event.message || 'Unknown error') +
        '\n  at ' +
        (event.filename || '?') +
        ':' +
        (event.lineno || 0) +
        ':' +
        (event.colno || 0),
      source: 'window.onerror',
    });
  });

  // --- Unhandled promise rejections ---
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    send({
      time: new Date().toISOString(),
      elapsed: elapsed(),
      level: 'UNHANDLED_REJECTION',
      message: reason instanceof Error
        ? reason.name + ': ' + reason.message + '\n' + (reason.stack || '')
        : safe(reason),
      source: 'unhandledrejection',
    });
  });

  // --- Performance observer for long tasks ---
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          send({
            time: new Date().toISOString(),
            elapsed: elapsed(),
            level: 'PERF',
            message:
              entry.entryType +
              ': ' +
              entry.name +
              ' duration=' +
              entry.duration.toFixed(1) +
              'ms start=' +
              entry.startTime.toFixed(1) +
              'ms',
            source: 'performance',
          });
        });
      }).observe({ entryTypes: ['longtask'] });
    } catch (_) {
      // longtask not supported in all browsers
    }
  }

  // --- Expose boot log buffer for the extension to read ---
  window.__CONSOLE_CAPTURE_NAV_START__ = navStart;

  // Self-test entry that travels through the full capture pipeline so the
  // downloaded log file always has at least one visible entry as proof the
  // scripts injected successfully.
  send({
    time: new Date().toISOString(),
    elapsed: elapsed(),
    level: 'INFO',
    message: '[ConsoleCapture] Recording started — page load at ' + new Date(navStart).toISOString() + ' | URL: ' + location.href,
    source: 'console-capture',
  });

  // Also read any boot-log entries the app may have captured before us
  if (window.__BOOT_LOG__ && window.__BOOT_LOG__.entries) {
    var bootEntries = window.__BOOT_LOG__.entries;
    for (var i = 0; i < bootEntries.length; i++) {
      var be = bootEntries[i];
      send({
        time: new Date(window.__BOOT_LOG__.t0 + be.ms).toISOString(),
        elapsed: '+' + be.ms + 'ms (boot)',
        level: 'BOOT_' + be.lvl,
        message: be.msg,
        source: 'boot-logger',
      });
    }
  }

  originals.log.call(console, '[ConsoleCapture] Recording active — page load at', new Date(navStart).toISOString());
})();
