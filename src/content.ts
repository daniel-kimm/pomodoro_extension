// Content script — runs on web pages you specify in manifest
// This will handle tab blurring based on study session state

console.log('Pomodoro Study Extension content script loaded.');

let isStudySessionActive = false;
let studySubject = '';

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STUDY_SESSION_UPDATE') {
    isStudySessionActive = message.isRunning;
    studySubject = message.studySubject;
    // TODO: Add LLM-based tab detection and blurring logic here
    console.log('Study session update:', { isStudySessionActive, studySubject });
  }
  return true;
});

// Load initial state
chrome.storage.local.get(['isRunning', 'studySubject'], (result) => {
  isStudySessionActive = result.isRunning ?? false;
  studySubject = result.studySubject ?? '';
  console.log('Initial study session state:', { isStudySessionActive, studySubject });
});

// Extract metadata from the current page
function extractMetadata() {
  const url = window.location.href;
  const domain = window.location.hostname;
  const title = document.title;

  // Get description from meta tags
  const description = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";

  // Get a snippet of the page text content 
  const bodyText = document.body.innerText || "";
  const textSnippet = bodyText.slice(0, 2000); // First 2000 characters 

  return {
    url,
    domain,
    title,
    description,
    textSnippet,
  };
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "EXTRACT_METADATA") {
    const metadata = extractMetadata();

    chrome.runtime.sendMessage({
      type: "METADATA_RESULT",
      data: metadata,
    });
  }
});