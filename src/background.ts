// Background service worker (Manifest V3) — owns the Pomodoro countdown so it keeps running
// when the toolbar popup is closed.
//
// Chrome requires alarm periodInMinutes >= 1; sub-minute ticks use one-shot alarms via `when`.

const ALARM_NAME = 'pomodoro-timer';

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

  if (changes.isRunning || changes.studySubject) {
    chrome.storage.local.get(['isRunning', 'studySubject'], (r) => {
      const sessionRunning = r.isRunning ?? false;
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: 'STUDY_SESSION_UPDATE',
                isRunning: sessionRunning,
                studySubject: r.studySubject ?? '',
              })
              .catch(() => {});

            if (!sessionRunning) {
              chrome.tabs
                .sendMessage(tab.id, {
                  type: 'BLUR_DECISION',
                  shouldBlur: false,
                })
                .catch(() => {});
            }
          }
        });
      });
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_METADATA' });
  }
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
    const { currentTask } = await chrome.storage.local.get(['currentTask']);
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
