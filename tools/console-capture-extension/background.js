/**
 * Background service worker.
 *
 * Manages recording state, stores captured log entries, and handles
 * communication between the page (via content-bridge) and the popup.
 *
 * Uses chrome.scripting.registerContentScripts so that both the MAIN-world
 * capture script and the ISOLATED-world bridge survive full page navigations
 * (e.g. redirect from /home → /home/agent/setup) and inject at
 * document_start to catch the earliest errors.
 */

const CAPTURE_ID = 'parlae-capture-main';
const BRIDGE_ID = 'parlae-capture-bridge';

const state = {
  recordingTabId: null,
  logs: [],
  tabUrl: '',
  startedAt: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────

function matchPattern(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return null;
    }
    const host = u.hostname + (u.port ? ':' + u.port : '');
    return u.protocol + '//' + host + '/*';
  } catch {
    return null;
  }
}

async function unregisterScripts() {
  try {
    await chrome.scripting.unregisterContentScripts({
      ids: [CAPTURE_ID, BRIDGE_ID],
    });
  } catch {
    // scripts weren't registered — that's fine
  }
}

async function injectImmediate(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content-bridge.js'],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['page-capture.js'],
    world: 'MAIN',
  });
}

async function collectPerfTiming(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const nav = performance.getEntriesByType('navigation')[0];
        if (!nav) return null;
        return {
          redirectTime: Math.round(nav.redirectEnd - nav.redirectStart),
          dnsLookup: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
          tcpConnect: Math.round(nav.connectEnd - nav.connectStart),
          ttfb: Math.round(nav.responseStart - nav.requestStart),
          download: Math.round(nav.responseEnd - nav.responseStart),
          domInteractive: Math.round(nav.domInteractive),
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
          loadEvent: Math.round(nav.loadEventEnd),
          totalDuration: Math.round(nav.duration),
          transferSize: nav.transferSize,
          type: nav.type,
        };
      },
    });
    return result?.result || null;
  } catch {
    return null;
  }
}

// ── Start / Stop ─────────────────────────────────────────────────────────

async function startRecording(tabId, url) {
  if (!matchPattern(url)) {
    throw new Error('Navigate to an http/https page first (current: ' + url + ')');
  }

  await unregisterScripts();

  state.recordingTabId = tabId;
  state.logs = [];
  state.tabUrl = url;
  state.startedAt = new Date().toISOString();

  // Use broad patterns so capture survives cross-domain navigations
  // (e.g. OAuth redirects through accounts.google.com → app.parlae.ca).
  const allHttp = ['http://*/*', 'https://*/*'];

  await chrome.scripting.registerContentScripts([
    {
      id: BRIDGE_ID,
      matches: allHttp,
      js: ['content-bridge.js'],
      runAt: 'document_start',
      world: 'ISOLATED',
    },
    {
      id: CAPTURE_ID,
      matches: allHttp,
      js: ['page-capture.js'],
      runAt: 'document_start',
      world: 'MAIN',
    },
  ]);

  await injectImmediate(tabId);
}

async function stopRecording(tabId) {
  const perf = await collectPerfTiming(tabId);
  await unregisterScripts();

  if (perf) {
    state.logs.push({
      time: new Date().toISOString(),
      elapsed: 'summary',
      level: 'PERF_SUMMARY',
      message: JSON.stringify(perf, null, 2),
      source: 'navigation-timing',
    });
  }

  const logs = [...state.logs];
  const meta = {
    url: state.tabUrl,
    startedAt: state.startedAt,
    stoppedAt: new Date().toISOString(),
    entryCount: logs.length,
    userAgent: null,
  };

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        window.__CONSOLE_CAPTURE_ACTIVE__ = false;
        return navigator.userAgent;
      },
    });
    meta.userAgent = result?.result || null;
  } catch {}

  state.recordingTabId = null;
  return { logs, meta };
}

// ── Message handler ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'log_entry') {
    if (state.recordingTabId !== null) {
      // Track the latest URL for the meta section
      if (message.url) {
        state.tabUrl = message.url;
      }
      state.logs.push({
        ...message.entry,
        url: message.url,
      });
      // Best-effort notification to popup (it may be closed)
      chrome.runtime
        .sendMessage({ type: 'log_count', count: state.logs.length })
        .catch(() => {});
    }
    return false;
  }

  if (message.type === 'start_recording') {
    startRecording(message.tabId, message.url)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'stop_recording') {
    stopRecording(message.tabId)
      .then(({ logs, meta }) =>
        sendResponse({ success: true, logs, meta, count: logs.length }),
      )
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'get_status') {
    sendResponse({
      recording: state.recordingTabId === message.tabId,
      count: state.logs.length,
      startedAt: state.startedAt,
    });
    return false;
  }

  if (message.type === 'clear_logs') {
    state.logs = [];
    sendResponse({ success: true });
    return false;
  }
});
