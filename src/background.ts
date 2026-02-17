// Background service worker (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  console.log('IEEE Extension installed.');
});
