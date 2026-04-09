// Content script — runs on web pages you specify in manifest
// This will handle tab blurring based on study session state

console.log('Pomodoro Study Extension content script loaded.');

let isStudySessionActive = false;
let studySubject = '';

// Create overlay for blocking
const overlay = document.createElement('div');
overlay.id = 'pomodoro-overlay';
overlay.style.cssText = `
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  z-index: 999999;
  display: none;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  color: white;
  font-family: Arial, sans-serif;
  text-align: center;
`;

const message = document.createElement('div');
message.innerHTML = `
  <h2>🍅 Study Session Active</h2>
  <p>This tab is blocked to help you focus on your study subject: <strong>${studySubject}</strong></p>
`;

const unblockButton = document.createElement('button');
unblockButton.textContent = 'Unblock This Tab';
unblockButton.style.cssText = `
  padding: 10px 20px;
  font-size: 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  margin-top: 20px;
`;

unblockButton.addEventListener('click', () => {
  overlay.style.display = 'none';
  document.body.style.filter = 'none';
});

overlay.appendChild(message);
overlay.appendChild(unblockButton);
document.body.appendChild(overlay);

// Function to check if page should be blocked
function shouldBlockPage() {
  if (!isStudySessionActive || !studySubject.trim()) return false;

  const title = document.title.toLowerCase();
  const bodyText = document.body.innerText.toLowerCase();
  const subject = studySubject.toLowerCase();

  // Block if study subject is not in title or body
  return !title.includes(subject) && !bodyText.includes(subject);
}

// Function to update blocking
function updateBlocking() {
  if (shouldBlockPage()) {
    overlay.style.display = 'flex';
    document.body.style.filter = 'blur(5px)';
  } else {
    overlay.style.display = 'none';
    document.body.style.filter = 'none';
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STUDY_SESSION_UPDATE') {
    isStudySessionActive = message.isRunning;
    studySubject = message.studySubject;
    updateBlocking();
    console.log('Study session update:', { isStudySessionActive, studySubject });
  }
  return true;
});

// Load initial state
chrome.storage.local.get(['isRunning', 'studySubject'], (result) => {
  isStudySessionActive = result.isRunning ?? false;
  studySubject = result.studySubject ?? '';
  updateBlocking();
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