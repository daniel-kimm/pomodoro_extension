// Background service worker (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  console.log('Pomodoro Study Extension installed.');
});

// Listen for storage changes to sync timer state
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.isRunning || changes.studySubject) {
      const sessionRunning = changes.isRunning?.newValue ?? false;

      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'STUDY_SESSION_UPDATE',
              isRunning: sessionRunning,
              studySubject: changes.studySubject?.newValue ?? ''
            }).catch(() => {});

            if (!sessionRunning) {
              chrome.tabs.sendMessage(tab.id, {
                type: 'BLUR_DECISION',
                shouldBlur: false,
              }).catch(() => {});
            }
          }
        });
      });
    }
  }
});

// Listen for tab updates to trigger metadata extraction
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.startsWith("http")) {
    chrome.tabs.sendMessage(tabId, {
      type: "EXTRACT_METADATA",
    });
  }
});

// Listen for messages from content scripts (e.g., metadata results)
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "METADATA_RESULT") {
    classifyTab(message.data, sender.tab?.id);
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
    const { currentTask } = await chrome.storage.local.get(["currentTask"]);
    const task = currentTask || "Study";

    console.log("Sending to backend:", {
      task,
      metadata,
    });

    const response = await fetch("http://localhost:3001/classify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task,
        tab: metadata,
      }),
    });

    const data = await response.json();

    console.log("Classification result:", {
      task,
      url: metadata.url,
      decision: data.decision,
      raw: data.raw,
      tabId,
    });

    if (tabId != null) {
      chrome.tabs.sendMessage(tabId, {
        type: "BLUR_DECISION",
        shouldBlur: data.decision === 1,
      }).catch(() => {});
    }
  } catch (error) {
    console.error("Error classifying tab:", error);
  }
}