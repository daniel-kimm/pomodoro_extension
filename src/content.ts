let isStudySessionActive = false;
let studySubject = '';
let overlayEl: HTMLElement | null = null;

function createOverlay() {
  if (overlayEl) return;

  overlayEl = document.createElement('div');
  overlayEl.id = 'pomodoro-blur-overlay';

  const style = document.createElement('style');
  style.textContent = `
    #pomodoro-blur-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
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
  `;

  overlayEl.innerHTML = `
    <h2>This tab is blocked</h2>
    <p>Stay focused — get back to studying!</p>
  `;

  document.documentElement.appendChild(style);
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

    if (!isStudySessionActive) {
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

chrome.storage.local.get(['isRunning', 'studySubject'], (result) => {
  isStudySessionActive = result.isRunning ?? false;
  studySubject = result.studySubject ?? '';
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
