// Background service worker (Manifest V3) — owns the Pomodoro countdown so it keeps running
// when the toolbar popup is closed.
//
// Chrome requires alarm periodInMinutes >= 1; sub-minute ticks use one-shot alarms via `when`.

const ALARM_NAME = 'pomodoro-timer';

function getManifestContentScriptFiles(): string[] {
  const m = chrome.runtime.getManifest() as unknown as {
    content_scripts?: { js?: string[] }[];
  };
  return m.content_scripts?.[0]?.js ?? [];
}

/** URLs where Chrome allows injecting / messaging (not chrome://, Web Store, etc.). */
function isInjectablePageUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('devtools:') ||
    url.startsWith('chrome-untrusted:')
  ) {
    return false;
  }
  if (url.includes('chromewebstore.google.com') || url.includes('chrome.google.com/webstore')) {
    return false;
  }
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'file:';
  } catch {
    return false;
  }
}

function storageLooksLikeActiveStudySession(r: {
  sessionStarted?: boolean;
  isRunning?: boolean;
  timeRemaining?: number;
  studySubject?: string;
}): boolean {
  if (r.sessionStarted === false) return false;
  if (r.sessionStarted === true) return true;
  if (r.isRunning === true) return true;
  if ((r.timeRemaining ?? 0) > 0 && Boolean(r.studySubject)) return true;
  return false;
}

function pushStudySessionToTab(
  tabId: number,
  tabUrl: string | undefined,
  isRunning: boolean,
  studySubject: string
): void {
  if (!isInjectablePageUrl(tabUrl)) return;
  const payload = {
    type: 'STUDY_SESSION_UPDATE' as const,
    isRunning,
    studySubject,
  };
  chrome.tabs.sendMessage(tabId, payload).catch(() => {
    const files = getManifestContentScriptFiles();
    if (files.length === 0) return;
    chrome.scripting
      .executeScript({ target: { tabId }, files })
      .then(() => {
        chrome.tabs.sendMessage(tabId, payload).catch(() => {});
      })
      .catch(() => {});
  });
}

function broadcastStudySessionToAllTabs(): void {
  chrome.storage.local.get(
    ['isRunning', 'studySubject', 'sessionStarted', 'timeRemaining'],
    (r) => {
      const sessionRunning = r.isRunning ?? false;
      const studySubject = r.studySubject ?? '';
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          const id = tab.id;
          if (id == null) continue;
          pushStudySessionToTab(id, tab.url, sessionRunning, studySubject);
          if (!sessionRunning && isInjectablePageUrl(tab.url)) {
            chrome.tabs
              .sendMessage(id, { type: 'BLUR_DECISION', shouldBlur: false })
              .catch(() => {});
          }
        }
      });
    }
  );
}

function pushMetadataRequest(tabId: number, tabUrl: string | undefined): void {
  if (!isInjectablePageUrl(tabUrl)) return;
  chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_METADATA' }).catch(() => {
    const files = getManifestContentScriptFiles();
    if (files.length === 0) return;
    chrome.scripting
      .executeScript({ target: { tabId }, files })
      .then(() => {
        chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_METADATA' }).catch(() => {});
      })
      .catch(() => {});
  });
}

function formatBadge(seconds: number): string {
  if (seconds <= 0) return '0';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.ceil(seconds / 60);
  if (m < 100) return `${m}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function syncBadge(): void {
  chrome.storage.local.get(['sessionStarted', 'isRunning', 'timeRemaining'], (r) => {
    const tr = r.timeRemaining ?? 0;
    if (!r.sessionStarted || tr <= 0) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    chrome.action.setBadgeText({ text: formatBadge(tr) });
    chrome.action.setBadgeBackgroundColor({ color: r.isRunning ? '#4688F2' : '#6B7280' });
  });
}

/** Next tick in ~1s using one-shot alarm (valid on all Chrome versions). */
function scheduleNextTick(): void {
  chrome.storage.local.get(['isRunning', 'timeRemaining'], (r) => {
    if (!r.isRunning || (r.timeRemaining ?? 0) <= 0) {
      chrome.alarms.clear(ALARM_NAME);
      return;
    }
    chrome.alarms.clear(ALARM_NAME);
    chrome.alarms.create(ALARM_NAME, { when: Date.now() + 1000 });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Pomodoro Study Extension installed.');
  syncBadge();
  scheduleNextTick();
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    syncBadge();
    scheduleNextTick();
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  chrome.storage.local.get(['timeRemaining', 'isRunning', 'sessionStarted'], (result) => {
    if (!result.isRunning) {
      chrome.alarms.clear(ALARM_NAME);
      return;
    }

    const newTime = Math.max(0, (result.timeRemaining || 0) - 1);
    if (newTime <= 0) {
      chrome.storage.local.set(
        {
          isRunning: false,
          timeRemaining: 0,
          sessionStarted: result.sessionStarted ?? true,
        },
        () => {
          chrome.alarms.clear(ALARM_NAME);
          syncBadge();
        }
      );
      return;
    }

    chrome.storage.local.set({ timeRemaining: newTime }, () => {
      scheduleNextTick();
      syncBadge();
    });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_TIMER') {
    scheduleNextTick();
    syncBadge();
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'PAUSE_TIMER') {
    chrome.alarms.clear(ALARM_NAME);
    syncBadge();
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'RESUME_TIMER') {
    scheduleNextTick();
    syncBadge();
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'RESET_TIMER') {
    chrome.alarms.clear(ALARM_NAME);
    syncBadge();
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'OPEN_POPUP') {
    chrome.action.openPopup().catch(() => {});
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'METADATA_RESULT') {
    classifyTab(message.data, sender.tab?.id);
  }
  if (message.type === 'GOOGLE_AUTH_FLOW') {
    chrome.identity.launchWebAuthFlow(
      { url: message.url, interactive: true },
      (callbackUrl) => {
        if (chrome.runtime.lastError || !callbackUrl) {
          chrome.storage.local.set({ pendingAuth: null });
          sendResponse({ error: chrome.runtime.lastError?.message ?? 'Auth cancelled' });
          return;
        }
        try {
          const hashParams = new URLSearchParams(new URL(callbackUrl).hash.substring(1));
          const access_token = hashParams.get('access_token');
          const refresh_token = hashParams.get('refresh_token');
          if (access_token && refresh_token) {
            chrome.storage.local.set({ pendingAuth: { access_token, refresh_token } });
            sendResponse({ access_token, refresh_token });
          } else {
            chrome.storage.local.set({ pendingAuth: null });
            sendResponse({ error: 'Missing tokens in callback' });
          }
        } catch {
          chrome.storage.local.set({ pendingAuth: null });
          sendResponse({ error: 'Failed to parse auth callback' });
        }
      }
    );
    return true;
  }
  if (message.type === 'POMO_RESYNC_TAB') {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      chrome.storage.local.get(['isRunning', 'studySubject'], (r) => {
        chrome.tabs
          .sendMessage(tabId, {
            type: 'STUDY_SESSION_UPDATE',
            isRunning: r.isRunning ?? false,
            studySubject: r.studySubject ?? '',
          })
          .catch(() => {});
      });
    }
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

chrome.storage.local.get(['isRunning', 'timeRemaining'], (result) => {
  if (result.isRunning && (result.timeRemaining ?? 0) > 0) {
    scheduleNextTick();
  }
  syncBadge();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes.timeRemaining || changes.isRunning || changes.sessionStarted) {
    syncBadge();
  }

  if (changes.isRunning || changes.studySubject || changes.sessionStarted) {
    broadcastStudySessionToAllTabs();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || tab.url == null) return;
  chrome.storage.local.get(
    ['sessionStarted', 'isRunning', 'timeRemaining', 'studySubject'],
    (r) => {
      if (!storageLooksLikeActiveStudySession(r)) return;
      if (r.isRunning) pushMetadataRequest(tabId, tab.url);
      pushStudySessionToTab(tabId, tab.url, r.isRunning ?? false, r.studySubject ?? '');
    }
  );
});

async function classifyTab(
  metadata: {
    url: string;
    domain: string;
    title: string;
    description: string;
    textSnippet: string;
  },
  tabId?: number
) {
  try {
    const { currentTask, isRunning } = await chrome.storage.local.get(['currentTask', 'isRunning']);
    if (!isRunning) return;

    const task = currentTask || 'Study';

    console.log('Sending to backend:', {
      task,
      metadata,
    });

    const response = await fetch('http://localhost:3001/classify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task,
        tab: metadata,
      }),
    });

    const data = await response.json();

    console.log('Classification result:', {
      task,
      url: metadata.url,
      decision: data.decision,
      raw: data.raw,
      tabId,
    });

    if (tabId != null) {
      chrome.tabs
        .sendMessage(tabId, {
          type: 'BLUR_DECISION',
          shouldBlur: data.decision === 1,
        })
        .catch(() => {});
    }
  } catch (error) {
    console.error('Error classifying tab:', error);
  }
}
