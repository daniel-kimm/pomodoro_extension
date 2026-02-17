// Background service worker (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  console.log('Pomodoro Study Extension installed.');
});

// Listen for storage changes to sync timer state
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.isRunning || changes.studySubject) {
      // Broadcast to all tabs that study session state changed
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'STUDY_SESSION_UPDATE',
              isRunning: changes.isRunning?.newValue ?? false,
              studySubject: changes.studySubject?.newValue ?? ''
            }).catch(() => {
              // Ignore errors for tabs that don't have content script ready
            });
          }
        });
      });
    }
  }
});
