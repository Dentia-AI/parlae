/* global chrome */

const $ = (sel) => document.querySelector(sel);
const btnStart = $('#btn-start');
const btnStop = $('#btn-stop');
const btnDownload = $('#btn-download');
const btnClear = $('#btn-clear');
const tabInfoEl = $('#tab-info');
const logCountEl = $('#log-count');
const timerEl = $('#timer');
const statusDot = $('#status-dot');

let currentTab = null;
let isRecording = false;
let timerInterval = null;
let recordingStartedAt = null;
let lastLogs = null;
let lastMeta = null;

// ── Initialise ───────────────────────────────────────────────────────────

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  tabInfoEl.textContent = tab ? tab.url : 'No active tab';

  if (tab) {
    chrome.runtime.sendMessage(
      { type: 'get_status', tabId: tab.id },
      (res) => {
        if (res && res.recording) {
          setRecordingUI(true);
          logCountEl.textContent = String(res.count || 0);
          if (res.startedAt) {
            recordingStartedAt = new Date(res.startedAt);
            startTimer();
          }
        }
      },
    );
  }
}

init();

// ── Timer ────────────────────────────────────────────────────────────────

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!recordingStartedAt) return;
    const elapsed = Date.now() - recordingStartedAt.getTime();
    const s = Math.floor(elapsed / 1000) % 60;
    const m = Math.floor(elapsed / 60000);
    timerEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerEl.textContent = '';
}

// ── UI state ─────────────────────────────────────────────────────────────

function setRecordingUI(recording) {
  isRecording = recording;
  btnStart.disabled = recording;
  btnStop.disabled = !recording;
  statusDot.classList.toggle('recording', recording);
}

// ── Live log count updates ───────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'log_count') {
    logCountEl.textContent = String(msg.count);
  }
});

// ── Start Recording ──────────────────────────────────────────────────────

btnStart.addEventListener('click', () => {
  if (!currentTab) return;

  if (
    !currentTab.url ||
    (!currentTab.url.startsWith('http://') && !currentTab.url.startsWith('https://'))
  ) {
    alert(
      'Navigate to a web page (http:// or https://) first.\n\n' +
        'Current tab: ' + (currentTab.url || 'unknown'),
    );
    return;
  }

  btnStart.disabled = true;
  btnStart.textContent = 'Starting…';

  chrome.runtime.sendMessage(
    { type: 'start_recording', tabId: currentTab.id, url: currentTab.url },
    (res) => {
      if (res && res.success) {
        setRecordingUI(true);
        logCountEl.textContent = '0';
        recordingStartedAt = new Date();
        lastLogs = null;
        lastMeta = null;
        btnDownload.disabled = true;
        startTimer();
      } else {
        btnStart.disabled = false;
        alert('Failed to start: ' + (res?.error || 'unknown'));
      }
      btnStart.textContent = 'Start Recording';
    },
  );
});

// ── Stop Recording ───────────────────────────────────────────────────────

btnStop.addEventListener('click', () => {
  if (!currentTab) return;

  btnStop.disabled = true;
  btnStop.textContent = 'Stopping…';

  chrome.runtime.sendMessage(
    { type: 'stop_recording', tabId: currentTab.id },
    (res) => {
      setRecordingUI(false);
      stopTimer();
      btnStop.textContent = 'Stop Recording';

      if (res && res.success) {
        logCountEl.textContent = String(res.count);
        lastLogs = res.logs;
        lastMeta = res.meta;
        btnDownload.disabled = res.count === 0;
      } else {
        alert('Failed to stop: ' + (res?.error || 'unknown'));
      }
    },
  );
});

// ── Download ─────────────────────────────────────────────────────────────

btnDownload.addEventListener('click', () => {
  if (!lastLogs) return;
  const text = formatLogs(lastLogs, lastMeta);
  downloadText(text, 'console-capture-' + fileTimestamp() + '.txt');
});

function formatLogs(logs, meta) {
  const lines = [];

  const visibleLogs = logs.filter((l) => l.level !== 'PERF_SUMMARY');

  lines.push('='.repeat(72));
  lines.push('  CONSOLE LOG CAPTURE');
  lines.push('='.repeat(72));
  lines.push('');
  if (meta) {
    lines.push('URL:        ' + (meta.url || 'N/A'));
    lines.push('Started:    ' + (meta.startedAt || 'N/A'));
    lines.push('Stopped:    ' + (meta.stoppedAt || 'N/A'));
    lines.push('Entries:    ' + visibleLogs.length);
    lines.push('User-Agent: ' + (meta.userAgent || 'N/A'));
  }
  lines.push('');

  // Performance summary (if present)
  const perfEntry = logs.find((l) => l.level === 'PERF_SUMMARY');
  if (perfEntry) {
    lines.push('-'.repeat(72));
    lines.push('  NAVIGATION TIMING');
    lines.push('-'.repeat(72));
    lines.push(perfEntry.message);
    lines.push('');
  }

  lines.push('-'.repeat(72));
  lines.push('  LOG ENTRIES (' + visibleLogs.length + ')');
  lines.push('-'.repeat(72));
  lines.push('');

  for (const entry of visibleLogs) {
    const prefix =
      '[' +
      (entry.elapsed || '?') +
      '] [' +
      (entry.level || '?') +
      ']';
    const urlSuffix = entry.url ? '  (' + entry.url + ')' : '';
    lines.push(prefix + ' ' + (entry.message || '') + urlSuffix);
  }

  lines.push('');
  lines.push('='.repeat(72));
  lines.push('  END OF CAPTURE');
  lines.push('='.repeat(72));

  return lines.join('\n');
}

function fileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Clear ────────────────────────────────────────────────────────────────

btnClear.addEventListener('click', () => {
  if (!currentTab) return;

  chrome.runtime.sendMessage(
    { type: 'clear_logs', tabId: currentTab.id },
    () => {
      logCountEl.textContent = '0';
      lastLogs = null;
      lastMeta = null;
      btnDownload.disabled = true;
    },
  );
});
