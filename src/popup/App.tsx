import React, { useState, useEffect } from 'react';

function App() {
  const [studyTimer, setStudyTimer] = useState<number>(25);
  const [studySubject, setStudySubject] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(25 * 60); // in seconds

  // Load saved settings on mount
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['studyTimer', 'studySubject', 'isRunning', 'timeRemaining'], (result: { [key: string]: any }) => {
        if (result.studyTimer) setStudyTimer(result.studyTimer);
        if (result.studySubject) setStudySubject(result.studySubject);
        if (result.isRunning !== undefined) setIsRunning(result.isRunning);
        if (result.timeRemaining) setTimeRemaining(result.timeRemaining);
      });
    }
  }, []);

  // Save settings to Chrome storage
  const saveSettings = (data?: { studyTimer?: number; studySubject?: string; isRunning?: boolean; timeRemaining?: number }) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({
        studyTimer: data?.studyTimer ?? studyTimer,
        studySubject: data?.studySubject ?? studySubject,
        isRunning: data?.isRunning ?? isRunning,
        timeRemaining: data?.timeRemaining ?? timeRemaining
      });
    }
  };

  // Timer countdown effect
  useEffect(() => {
    let interval: number | null = null;
    
    if (isRunning && timeRemaining > 0) {
      interval = window.setInterval(() => {
        setTimeRemaining((prev: number) => {
          const newTime = prev - 1;
          // Save time remaining periodically (every 5 seconds to avoid too many writes)
          if (newTime % 5 === 0 && typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({ timeRemaining: newTime });
          }
          if (newTime <= 0) {
            setIsRunning(false);
            if (typeof chrome !== 'undefined' && chrome.storage) {
              chrome.storage.local.set({ isRunning: false, timeRemaining: 0 });
            }
            // Timer finished - you can add notification here
            return 0;
          }
          return newTime;
        });
      }, 1000);
    }

    return () => {
      if (interval !== null) clearInterval(interval);
    };
  }, [isRunning, timeRemaining]);

  // Save settings when timer/subject changes (only when not running)
  useEffect(() => {
    if (!isRunning) {
      saveSettings();
    }
  }, [studyTimer, studySubject]);

  const handleStart = () => {
    if (!studySubject.trim()) {
      alert('Please enter a study subject');
      return;
    }
    const initialTime = studyTimer * 60;
    setIsRunning(true);
    setTimeRemaining(initialTime);
    saveSettings({ isRunning: true, timeRemaining: initialTime });
  };

  const handleStop = () => {
    setIsRunning(false);
    saveSettings({ isRunning: false });
  };

  const handleReset = () => {
    const resetTime = studyTimer * 60;
    setIsRunning(false);
    setTimeRemaining(resetTime);
    saveSettings({ isRunning: false, timeRemaining: resetTime });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="popup">
      <div className="header">
        <h1>🍅 Pomodoro Study</h1>
      </div>

      {!isRunning ? (
        <div className="setup-section">
          <div className="form-group">
            <label htmlFor="subject">Study Subject</label>
            <input
              id="subject"
              type="text"
              placeholder="e.g., Math, Computer Science..."
              value={studySubject}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStudySubject(e.target.value)}
              className="input-field"
            />
          </div>

          <div className="form-group">
            <label htmlFor="timer">Study Timer (minutes)</label>
            <input
              id="timer"
              type="number"
              min="1"
              max="120"
              value={studyTimer}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStudyTimer(parseInt(e.target.value) || 25)}
              className="input-field"
              disabled={isRunning}
            />
          </div>

          <button onClick={handleStart} className="btn btn-primary">
            Start Study Session
          </button>
        </div>
      ) : (
        <div className="timer-section">
          <div className="timer-display">
            <div className="timer-circle">
              <div className="timer-text">{formatTime(timeRemaining)}</div>
            </div>
            <div className="subject-display">Studying: {studySubject}</div>
          </div>

          <div className="timer-controls">
            <button onClick={handleStop} className="btn btn-secondary">
              Pause
            </button>
            <button onClick={handleReset} className="btn btn-secondary">
              Reset
            </button>
          </div>
        </div>
      )}

      <div className="info-text">
        Tabs not related to your study subject will be blurred.
      </div>
    </div>
  );
}

export default App;
