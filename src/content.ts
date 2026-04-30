(function () {
  const POMO_GUARD = '__pomoStudyExtension_cs_v1';
  const g = globalThis as unknown as Record<string, boolean>;
  if (g[POMO_GUARD]) {
    chrome.runtime.sendMessage({ type: 'POMO_RESYNC_TAB' });
    return;
  }
  g[POMO_GUARD] = true;

let task = '';
let overlayEl: HTMLElement | null = null;
/** Snapshot of media we paused when blocking; restored when overlay is removed. */
let blockedMediaSnapshot: Array<{
  el: HTMLMediaElement;
  wasPaused: boolean;
}> | null = null;
/** YouTube and similar sites call play() again after pause(); keep forcing pause while overlay is up. */
let mediaEnforceIntervalId: ReturnType<typeof setInterval> | null = null;
let mediaPlayBlockHandler: ((e: Event) => void) | null = null;
let widgetEl: HTMLElement | null = null;
let styleEl: HTMLStyleElement | null = null;
let localTimeRemaining = 0;
let localIsRunning = false;
let localSessionStarted = false;

/** While the timer is running, try to keep this (focused) tab in fullscreen; re-enter on exit. */
let fullscreenReapplyHandlersBound = false;
let fullscreenPromptBtn: HTMLButtonElement | null = null;
let fullscreenAutoRetryIntervalId: ReturnType<typeof setInterval> | null = null;

function isExtensionUiEventTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  if (t.closest('#pomodoro-timer-widget')) return true;
  if (t.closest('#pomodoro-overlay-fullscreen-btn')) return true;
  return false;
}

function maybeEnforceFullscreenFromUserAction(e: Event): void {
  if (!shouldEnforceTimerFullscreen()) return;
  if (isExtensionUiEventTarget(e.target)) return;
  if (getFullscreenElement() === document.documentElement) return;
  requestStudyFullscreen();
}

function getFullscreenElement(): Element | null {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

function shouldEnforceTimerFullscreen(): boolean {
  if (!localIsRunning) return false;
  if (localTimeRemaining <= 0) return false;
  if (localSessionStarted === false) return false;
  return true;
}

function refreshFullscreenPrompt(): void {
  if (!overlayEl || !fullscreenPromptBtn) return;
  const isLocked = getFullscreenElement() === document.documentElement;
  fullscreenPromptBtn.style.display = isLocked ? 'none' : 'inline-flex';
}

function requestStudyFullscreen(): void {
  if (!shouldEnforceTimerFullscreen()) return;
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;

  const el = document.documentElement;
  if (getFullscreenElement() === el) return;

  const wEl = el as typeof el & { webkitRequestFullscreen?: () => Promise<void> };
  const req = el.requestFullscreen?.bind(el) ?? wEl.webkitRequestFullscreen?.bind(wEl);
  if (req) void req().catch(() => {}).finally(() => refreshFullscreenPrompt());
}

function releaseStudyFullscreenIfOurs(): void {
  if (getFullscreenElement() !== document.documentElement) return;
  const d = document as Document & { webkitExitFullscreen?: () => Promise<void> };
  const exit = document.exitFullscreen?.bind(document) ?? d.webkitExitFullscreen?.bind(d);
  if (exit) void exit().catch(() => {});
}

function onFullscreenChangeReenter(): void {
  refreshFullscreenPrompt();
  if (!shouldEnforceTimerFullscreen()) {
    tearDownFullscreenReapply();
    return;
  }
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;
  if (getFullscreenElement() == null) {
    requestAnimationFrame(() => requestStudyFullscreen());
  }
}

function onFocusOrVisibilityForFullscreen(): void {
  if (shouldEnforceTimerFullscreen() && document.visibilityState === 'visible') {
    requestStudyFullscreen();
  } else if (!shouldEnforceTimerFullscreen()) {
    syncTimerFullscreenLock();
  }
}

function setUpFullscreenReapply(): void {
  if (fullscreenReapplyHandlersBound) return;
  fullscreenReapplyHandlersBound = true;
  document.addEventListener('fullscreenchange', onFullscreenChangeReenter);
  document.addEventListener('webkitfullscreenchange', onFullscreenChangeReenter);
  window.addEventListener('focus', onFocusOrVisibilityForFullscreen);
  document.addEventListener('visibilitychange', onFocusOrVisibilityForFullscreen);
  document.addEventListener('pointerdown', maybeEnforceFullscreenFromUserAction, true);
  document.addEventListener('keydown', maybeEnforceFullscreenFromUserAction, true);
  if (fullscreenAutoRetryIntervalId == null) {
    fullscreenAutoRetryIntervalId = window.setInterval(() => {
      if (!shouldEnforceTimerFullscreen()) return;
      requestStudyFullscreen();
    }, 1200);
  }
}

function tearDownFullscreenReapply(): void {
  if (!fullscreenReapplyHandlersBound) return;
  document.removeEventListener('fullscreenchange', onFullscreenChangeReenter);
  document.removeEventListener('webkitfullscreenchange', onFullscreenChangeReenter);
  window.removeEventListener('focus', onFocusOrVisibilityForFullscreen);
  document.removeEventListener('visibilitychange', onFocusOrVisibilityForFullscreen);
  document.removeEventListener('pointerdown', maybeEnforceFullscreenFromUserAction, true);
  document.removeEventListener('keydown', maybeEnforceFullscreenFromUserAction, true);
  if (fullscreenAutoRetryIntervalId != null) {
    window.clearInterval(fullscreenAutoRetryIntervalId);
    fullscreenAutoRetryIntervalId = null;
  }
  fullscreenReapplyHandlersBound = false;
}

function syncTimerFullscreenLock(): void {
  if (!shouldEnforceTimerFullscreen()) {
    tearDownFullscreenReapply();
    releaseStudyFullscreenIfOurs();
    return;
  }
  setUpFullscreenReapply();
  requestStudyFullscreen();
}

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
      font-family: Arial;
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
    #pomodoro-overlay-fullscreen-btn {
      margin-top: 16px;
      padding: 10px 14px;
      border: none;
      border-radius: 10px;
      background: rgba(56, 189, 248, 0.9);
      color: #03111a;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
    }
    #pomodoro-overlay-fullscreen-btn:hover {
      background: rgba(56, 189, 248, 1);
    }

    #pomodoro-timer-widget {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      display: flex;
      flex-direction: row;
      align-items: stretch;
      background: linear-gradient(165deg, #18181b 0%, #0f0f10 55%, #050505 100%);
      color: #f5f5f5;
      font-family: Arial;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.45);
      overflow: hidden;
      user-select: none;
      transition: border-color 0.15s, box-shadow 0.2s;
    }
    #pomodoro-timer-widget:hover {
      border-color: rgba(255,255,255,0.18);
      box-shadow: 0 10px 36px rgba(0,0,0,0.55);
    }
    #pomodoro-timer-widget.dragging {
      box-shadow: 0 12px 44px rgba(0,0,0,0.6);
    }
    #pomodoro-timer-widget .widget-main {
      padding: 12px 14px;
      cursor: grab;
      min-width: 0;
    }
    #pomodoro-timer-widget.dragging .widget-main {
      cursor: grabbing;
    }
    #pomodoro-timer-widget .widget-time {
      font-size: 26px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0;
      line-height: 1.1;
    }
    #pomodoro-timer-widget .widget-topline {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    #pomodoro-timer-widget .widget-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.08);
      color: #b6b6b8;
    }
    #pomodoro-timer-widget .widget-status__dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    #pomodoro-timer-widget.widget-running .widget-status {
      color: #22c55e;
      background: rgba(34,197,94,0.12);
      border-color: rgba(34,197,94,0.3);
    }
    #pomodoro-timer-widget.widget-paused .widget-status {
      color: #facc15;
      background: rgba(250,204,21,0.12);
      border-color: rgba(250,204,21,0.3);
    }
    #pomodoro-timer-widget.widget-done .widget-status {
      color: #b6b6b8;
      background: rgba(255,255,255,0.08);
      border-color: rgba(255,255,255,0.14);
    }
    #pomodoro-timer-widget .widget-subject {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #f5f5f5;
      margin-top: 7px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 160px;
      text-transform: uppercase;
    }
    #pomodoro-timer-widget .widget-side {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      flex-shrink: 0;
    }
    #pomodoro-timer-widget .widget-side--hidden {
      display: none;
    }
    #pomodoro-timer-widget .widget-divider {
      width: 1px;
      align-self: stretch;
      background: rgba(255,255,255,0.1);
      flex-shrink: 0;
    }
    #pomodoro-timer-widget .widget-actions {
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 6px 8px;
      flex-shrink: 0;
    }
    #pomodoro-timer-widget .widget-action-btn {
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #202024;
      border: 1px solid rgba(255,255,255,0.1);
      color: #f5f5f5;
      transition: background 0.15s, border-color 0.15s, transform 0.1s;
    }
    #pomodoro-timer-widget .widget-action-btn:hover {
      background: #2a2a2e;
      border-color: rgba(255,255,255,0.18);
    }
    #pomodoro-timer-widget .widget-action-btn:active {
      transform: scale(0.95);
    }
    #pomodoro-timer-widget .widget-action-btn--play {
      background: linear-gradient(135deg, #ffffff 0%, #e5e5e5 55%, #b8b8b8 100%);
      color: #0a0a0b;
    }
    #pomodoro-timer-widget .widget-action-btn--play:hover {
      background: linear-gradient(135deg, #ffffff 0%, #eeeeee 55%, #c7c7c7 100%);
    }
    #pomodoro-timer-widget .widget-icon-pause {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      height: 14px;
    }
    #pomodoro-timer-widget .widget-icon-pause .bar {
      width: 3px;
      height: 14px;
      background: currentColor;
      border-radius: 1px;
    }
    #pomodoro-timer-widget .widget-toggle-play {
      width: 0;
      height: 0;
      margin-left: 2px;
      border-top: 6px solid transparent;
      border-bottom: 6px solid transparent;
      border-left: 9px solid currentColor;
    }
    #pomodoro-timer-widget .widget-action-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
      transform: none;
    }
  `;
  document.documentElement.appendChild(styleEl);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Match popup logic: show widget for any active study session, including legacy storage without sessionStarted. */
function shouldShowWidgetFromStorage(result: {
  sessionStarted?: boolean;
  isRunning?: boolean;
  timeRemaining?: number;
  task?: string;
}): boolean {
  if (result.sessionStarted === false) return false;
  if (result.sessionStarted === true) return true;
  if (result.isRunning === true) return true;
  if ((result.timeRemaining ?? 0) > 0 && Boolean(result.task)) return true;
  return false;
}

function createWidget() {
  if (widgetEl) return;
  injectStyles();

  widgetEl = document.createElement('div');
  widgetEl.id = 'pomodoro-timer-widget';
  widgetEl.innerHTML = `
    <div class="widget-main" id="pomodoro-widget-drag-area">
      <div class="widget-topline">
        <div class="widget-time" id="pomodoro-widget-time">--:--</div>
        <div class="widget-status" id="pomodoro-widget-status">
          <span class="widget-status__dot" aria-hidden="true"></span>
          <span id="pomodoro-widget-status-text">Paused</span>
        </div>
      </div>
      <div class="widget-subject" id="pomodoro-widget-subject"></div>
    </div>
    <div class="widget-side" id="pomodoro-widget-side">
      <div class="widget-divider" aria-hidden="true"></div>
      <div class="widget-actions" id="pomodoro-widget-actions">
        <button type="button" class="widget-action-btn" id="pomodoro-widget-toggle" title="Pause" aria-label="Pause timer"></button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(widgetEl);

  const dragArea = widgetEl.querySelector('#pomodoro-widget-drag-area') as HTMLElement;
  makeDraggable(widgetEl, dragArea);

  const toggleBtn = widgetEl.querySelector('#pomodoro-widget-toggle') as HTMLButtonElement;
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (localIsRunning) {
      chrome.storage.local.set({ isRunning: false }, () => {
        localIsRunning = false;
        renderWidget();
        chrome.runtime.sendMessage({ type: 'PAUSE_TIMER' });
      });
    } else {
      chrome.storage.local.set({ isRunning: true }, () => {
        localIsRunning = true;
        renderWidget();
        chrome.runtime.sendMessage({ type: 'RESUME_TIMER' });
        // User gesture: helps the first `requestFullscreen` when resuming.
        requestStudyFullscreen();
      });
    }
  });

  syncFromStorage();
}

function removeWidget() {
  if (widgetEl) {
    widgetEl.remove();
    widgetEl = null;
  }
}

function syncFromStorage() {
  chrome.storage.local.get(
    ['timeRemaining', 'isRunning', 'task', 'sessionStarted'],
    (result) => {
      localTimeRemaining = result.timeRemaining ?? 0;
      task = result.task ?? '';
      localIsRunning = result.isRunning ?? false;
      localSessionStarted = result.sessionStarted ?? false;
      renderWidget();
    }
  );
}

function renderWidget() {
  const timeEl = document.getElementById('pomodoro-widget-time');
  const subjectEl = document.getElementById('pomodoro-widget-subject');
  const statusTextEl = document.getElementById('pomodoro-widget-status-text');
  const toggleBtn = document.getElementById('pomodoro-widget-toggle') as HTMLButtonElement | null;
  const sideEl = document.getElementById('pomodoro-widget-side');
  const canToggle =
    localTimeRemaining > 0 &&
    (localSessionStarted || localIsRunning || Boolean(task));

  if (timeEl) timeEl.textContent = formatTime(localTimeRemaining);
  if (subjectEl) subjectEl.textContent = task.toUpperCase();
  if (statusTextEl) {
    statusTextEl.textContent = localIsRunning ? 'Focusing' : canToggle ? 'Paused' : 'Session ended';
  }
  if (widgetEl) {
    widgetEl.classList.toggle('widget-running', localIsRunning);
    widgetEl.classList.toggle('widget-paused', !localIsRunning && canToggle);
    widgetEl.classList.toggle('widget-done', !canToggle);
  }

  if (toggleBtn && sideEl) {
    if (!canToggle) {
      sideEl.classList.add('widget-side--hidden');
    } else {
      sideEl.classList.remove('widget-side--hidden');
      if (localIsRunning) {
        toggleBtn.classList.remove('widget-action-btn--play');
        toggleBtn.title = 'Pause';
        toggleBtn.setAttribute('aria-label', 'Pause timer');
        toggleBtn.innerHTML =
          '<span class="widget-icon-pause" aria-hidden="true"><span class="bar"></span><span class="bar"></span></span>';
      } else {
        toggleBtn.classList.add('widget-action-btn--play');
        toggleBtn.title = 'Continue';
        toggleBtn.setAttribute('aria-label', 'Continue timer');
        toggleBtn.innerHTML = '<span class="widget-toggle-play" aria-hidden="true"></span>';
      }
    }
  }
  syncTimerFullscreenLock();
}

function makeDraggable(widget: HTMLElement, handle: HTMLElement) {
  let offsetX = 0,
    offsetY = 0;
  let startX = 0,
    startY = 0;
  let didDrag = false;

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    offsetX = widget.offsetLeft;
    offsetY = widget.offsetTop;
    didDrag = false;
    widget.classList.add('dragging');

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true;
      widget.style.left = offsetX + dx + 'px';
      widget.style.top = offsetY + dy + 'px';
      widget.style.right = 'auto';
    };
    const onUp = () => {
      widget.classList.remove('dragging');
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

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.timeRemaining != null) localTimeRemaining = changes.timeRemaining.newValue ?? 0;
  if (changes.task != null) task = changes.task.newValue ?? '';
  if (changes.isRunning != null) localIsRunning = changes.isRunning.newValue ?? false;
  if (changes.sessionStarted != null) localSessionStarted = changes.sessionStarted.newValue ?? false;

  const mayAffectWidget =
    changes.sessionStarted != null ||
    changes.timeRemaining != null ||
    changes.isRunning != null ||
    changes.task != null;

  if (mayAffectWidget) {
    chrome.storage.local.get(
      ['sessionStarted', 'isRunning', 'timeRemaining', 'task'],
      (r) => {
        localSessionStarted = r.sessionStarted ?? false;
        localTimeRemaining = r.timeRemaining ?? 0;
        localIsRunning = r.isRunning ?? false;
        if (r.task != null) task = r.task;

        if (!shouldShowWidgetFromStorage(r)) {
          removeWidget();
          removeOverlay();
          syncTimerFullscreenLock();
        } else if (!widgetEl) {
          createWidget();
        } else {
          renderWidget();
        }
      }
    );
    return;
  }

  renderWidget();
});

function queryAllMediaInDocument(root: Document | ShadowRoot): HTMLMediaElement[] {
  const seen = new Set<HTMLMediaElement>();
  const add = (el: Element) => {
    if (el instanceof HTMLMediaElement) {
      seen.add(el);
    }
  };
  const walk = (r: Document | ShadowRoot) => {
    r.querySelectorAll('video, audio').forEach((n) => add(n));
    r.querySelectorAll('*').forEach((node) => {
      if (node instanceof Element && node.shadowRoot) {
        walk(node.shadowRoot);
      }
    });
  };
  walk(root);
  return [...seen];
}

/** Pause playing videos/audio before the block overlay (e.g. YouTube) so audio does not continue underneath. */
function pauseMediaBeforeBlock() {
  if (blockedMediaSnapshot !== null) return;

  const mediaEls = queryAllMediaInDocument(document);
  blockedMediaSnapshot = mediaEls.map((el) => ({
    el,
    wasPaused: el.paused,
  }));

  for (const { el } of blockedMediaSnapshot) {
    try {
      el.pause();
    } catch {
      /* ignore */
    }
  }
}

function startBlockingMediaEnforcement() {
  stopBlockingMediaEnforcement();

  const forcePauseAll = () => {
    if (!overlayEl) return;
    try {
      for (const el of queryAllMediaInDocument(document)) {
        if (!el.paused) el.pause();
      }
    } catch {
      /* ignore */
    }
  };

  mediaEnforceIntervalId = window.setInterval(forcePauseAll, 120);
  forcePauseAll();

  mediaPlayBlockHandler = (e: Event) => {
    if (!overlayEl) return;
    const t = e.target;
    if (t instanceof HTMLMediaElement) {
      t.pause();
    }
  };
  document.addEventListener('play', mediaPlayBlockHandler, true);
  document.addEventListener('playing', mediaPlayBlockHandler, true);
}

function stopBlockingMediaEnforcement() {
  if (mediaEnforceIntervalId != null) {
    window.clearInterval(mediaEnforceIntervalId);
    mediaEnforceIntervalId = null;
  }
  if (mediaPlayBlockHandler) {
    document.removeEventListener('play', mediaPlayBlockHandler, true);
    document.removeEventListener('playing', mediaPlayBlockHandler, true);
    mediaPlayBlockHandler = null;
  }
}

function restoreMediaAfterUnblock() {
  if (!blockedMediaSnapshot) return;
  for (const { el, wasPaused } of blockedMediaSnapshot) {
    try {
      if (!wasPaused && el.isConnected) {
        void el.play().catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }
  blockedMediaSnapshot = null;
}

function createOverlay() {
  if (overlayEl) return;
  injectStyles();

  pauseMediaBeforeBlock();

  overlayEl = document.createElement('div');
  overlayEl.id = 'pomodoro-blur-overlay';
  overlayEl.innerHTML = `
    <h2>This tab is blocked</h2>
    <p>Stay focused — get back to studying! Click anywhere to continue in fullscreen.</p>
    <button id="pomodoro-overlay-fullscreen-btn" type="button">Enter fullscreen</button>
  `;
  document.documentElement.appendChild(overlayEl);
  overlayEl.addEventListener(
    'pointerdown',
    () => {
      requestStudyFullscreen();
    },
    true
  );
  fullscreenPromptBtn = overlayEl.querySelector(
    '#pomodoro-overlay-fullscreen-btn'
  ) as HTMLButtonElement | null;
  if (fullscreenPromptBtn) {
    fullscreenPromptBtn.addEventListener('click', () => {
      requestStudyFullscreen();
    });
  }
  refreshFullscreenPrompt();
  startBlockingMediaEnforcement();
}

function removeOverlay() {
  stopBlockingMediaEnforcement();
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  fullscreenPromptBtn = null;
  restoreMediaAfterUnblock();
}

function applySessionUpdate(studyTaskFromMsg: string) {
  if (studyTaskFromMsg) task = studyTaskFromMsg;
  chrome.storage.local.get(['sessionStarted', 'timeRemaining', 'isRunning', 'task'], (r) => {
    localTimeRemaining = r.timeRemaining ?? 0;
    localIsRunning = r.isRunning ?? false;
    if (r.task) task = r.task;
    localSessionStarted = r.sessionStarted ?? false;
    if (r.sessionStarted === undefined && shouldShowWidgetFromStorage(r)) {
      chrome.storage.local.set({ sessionStarted: true });
      localSessionStarted = true;
    }

    if (shouldShowWidgetFromStorage(r)) {
      createWidget();
      renderWidget();
    } else {
      removeWidget();
      removeOverlay();
      syncTimerFullscreenLock();
    }
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STUDY_SESSION_UPDATE') {
    applySessionUpdate(message.task ?? '');
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

chrome.storage.local.get(
  ['isRunning', 'task', 'timeRemaining', 'sessionStarted'],
  (result) => {
    task = result.task ?? '';
    localSessionStarted = result.sessionStarted ?? false;
    localTimeRemaining = result.timeRemaining ?? 0;
    localIsRunning = result.isRunning ?? false;
    if (result.sessionStarted === undefined && shouldShowWidgetFromStorage(result)) {
      chrome.storage.local.set({ sessionStarted: true });
      localSessionStarted = true;
    }
    if (shouldShowWidgetFromStorage(result)) {
      createWidget();
    }
  }
);

function extractMetadata() {
  const url = window.location.href;
  const domain = window.location.hostname;
  const title = document.title;
  const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const bodyText = document.body.innerText || '';
  const textSnippet = bodyText.slice(0, 2000);

  return { url, domain, title, description, textSnippet };
}

})();
