let isStudySessionActive = false;
let studySubject = '';
let overlayEl: HTMLElement | null = null;
let widgetEl: HTMLElement | null = null;
let styleEl: HTMLStyleElement | null = null;
let localTimeRemaining = 0;

function injectStyles() {
  if (styleEl) return;
  styleEl = document.createElement('style');
  styleEl.textContent = `
    #pomodoro-blur-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      backdrop-filter: blur(12px);
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      font-family: system-ui, -apple-system, sans-serif;
      color: white;
      pointer-events: auto;
    }
    #pomodoro-blur-overlay h2 {
      font-size: 28px;
      margin: 0 0 8px;
    }
    #pomodoro-blur-overlay p {
      font-size: 16px;
      opacity: 0.8;
      margin: 0;
    }

    #pomodoro-timer-widget {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      background: #1a1a2e;
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      border-radius: 12px;
      padding: 10px 14px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
      cursor: grab;
      user-select: none;
      transition: box-shadow 0.2s;
    }
    #pomodoro-timer-widget:hover {
      box-shadow: 0 6px 32px rgba(0,0,0,0.45);
    }
    #pomodoro-timer-widget.dragging {
      cursor: grabbing;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5);
    }
    #pomodoro-timer-widget .widget-time {
      font-size: 28px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: 1px;
    }
    #pomodoro-timer-widget .widget-subject {
      font-size: 12px;
      opacity: 0.6;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
    }
  `;
  document.documentElement.appendChild(styleEl);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function createWidget() {
  if (widgetEl) return;
  injectStyles();

  widgetEl = document.createElement('div');
  widgetEl.id = 'pomodoro-timer-widget';
  widgetEl.innerHTML = `
    <div class="widget-time" id="pomodoro-widget-time">--:--</div>
    <div class="widget-subject" id="pomodoro-widget-subject"></div>
  `;
  document.documentElement.appendChild(widgetEl);
  makeDraggable(widgetEl);
  syncFromStorage();
}

function removeWidget() {
  if (widgetEl) {
    widgetEl.remove();
    widgetEl = null;
  }
}

function syncFromStorage() {
  chrome.storage.local.get(['timeRemaining', 'isRunning', 'studySubject'], (result) => {
    localTimeRemaining = result.timeRemaining ?? 0;
    studySubject = result.studySubject ?? '';
    renderWidget();
  });
}

function renderWidget() {
  const timeEl = document.getElementById('pomodoro-widget-time');
  const subjectEl = document.getElementById('pomodoro-widget-subject');
  if (timeEl) timeEl.textContent = formatTime(localTimeRemaining);
  if (subjectEl) subjectEl.textContent = studySubject;
}

function makeDraggable(el: HTMLElement) {
  let offsetX = 0, offsetY = 0;
  let startX = 0, startY = 0;
  let didDrag = false;

  el.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    offsetX = el.offsetLeft;
    offsetY = el.offsetTop;
    didDrag = false;
    el.classList.add('dragging');

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true;
      el.style.left = offsetX + dx + 'px';
      el.style.top = offsetY + dy + 'px';
      el.style.right = 'auto';
    };
    const onUp = () => {
      el.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!didDrag) {
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// Keep local state in sync when storage changes (pause/resume/reset from popup)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.timeRemaining != null) localTimeRemaining = changes.timeRemaining.newValue ?? 0;
  if (changes.studySubject != null) studySubject = changes.studySubject.newValue ?? '';
  renderWidget();
});

function createOverlay() {
  if (overlayEl) return;
  injectStyles();

  overlayEl = document.createElement('div');
  overlayEl.id = 'pomodoro-blur-overlay';
  overlayEl.innerHTML = `
    <h2>This tab is blocked</h2>
    <p>Stay focused — get back to studying!</p>
  `;
  document.documentElement.appendChild(overlayEl);
}

function removeOverlay() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STUDY_SESSION_UPDATE') {
    isStudySessionActive = message.isRunning;
    studySubject = message.studySubject;

    if (isStudySessionActive) {
      createWidget();
    } else {
      removeWidget();
      removeOverlay();
    }
  }

  if (message.type === 'BLUR_DECISION') {
    if (message.shouldBlur) {
      createOverlay();
    } else {
      removeOverlay();
    }
  }

  if (message.type === 'EXTRACT_METADATA') {
    const metadata = extractMetadata();
    chrome.runtime.sendMessage({
      type: 'METADATA_RESULT',
      data: metadata,
    });
  }
});

chrome.storage.local.get(['isRunning', 'studySubject', 'timeRemaining'], (result) => {
  isStudySessionActive = result.isRunning ?? false;
  studySubject = result.studySubject ?? '';
  if (isStudySessionActive) {
    createWidget();
  }
});

function extractMetadata() {
  const url = window.location.href;
  const domain = window.location.hostname;
  const title = document.title;
  const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const bodyText = document.body.innerText || '';
  const textSnippet = bodyText.slice(0, 2000);

  return { url, domain, title, description, textSnippet };
}
