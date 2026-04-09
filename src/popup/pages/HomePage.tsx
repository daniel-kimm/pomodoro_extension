import React, { useState, useEffect, useCallback } from 'react';

function sendTimerMessage(type: 'START_TIMER' | 'PAUSE_TIMER' | 'RESUME_TIMER' | 'RESET_TIMER'): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type });
  }
}

export default function HomePage() {
  const [studyTimer, setStudyTimer] = useState<number>(25);
  const [studyTimerInput, setStudyTimerInput] = useState<string>('25');
  const [studySubject, setStudySubject] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(25 * 60);
  const [sessionStarted, setSessionStarted] = useState<boolean>(false);

  const applyStorage = useCallback((result: { [key: string]: unknown }) => {
    if (result.studyTimer != null && typeof result.studyTimer === 'number') {
      setStudyTimer(result.studyTimer);
      setStudyTimerInput(String(result.studyTimer));
    }
    if (typeof result.studySubject === 'string') setStudySubject(result.studySubject);
    if (typeof result.isRunning === 'boolean') setIsRunning(result.isRunning);
    if (typeof result.timeRemaining === 'number') setTimeRemaining(result.timeRemaining);
    if (typeof result.sessionStarted === 'boolean') setSessionStarted(result.sessionStarted);
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get(
      ['studyTimer', 'studySubject', 'isRunning', 'timeRemaining', 'sessionStarted'],
      (result) => {
        applyStorage(result);
        const hasSession =
          result.sessionStarted === true ||
          (result.sessionStarted === undefined &&
            (result.isRunning === true ||
              ((result.timeRemaining ?? 0) > 0 && Boolean(result.studySubject))));
        if (hasSession && result.sessionStarted === undefined) {
          setSessionStarted(true);
          chrome.storage.local.set({ sessionStarted: true });
        }
      }
    );
  }, [applyStorage]);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (changes.studyTimer?.newValue != null && typeof changes.studyTimer.newValue === 'number') {
        setStudyTimer(changes.studyTimer.newValue);
        setStudyTimerInput(String(changes.studyTimer.newValue));
      }
      if (changes.studySubject) setStudySubject((changes.studySubject.newValue as string) ?? '');
      if (changes.isRunning) setIsRunning(changes.isRunning.newValue ?? false);
      if (changes.timeRemaining) setTimeRemaining(changes.timeRemaining.newValue ?? 0);
      if (changes.sessionStarted) setSessionStarted(changes.sessionStarted.newValue ?? false);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const persist = (partial: Record<string, unknown>, done?: () => void) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      if (done) chrome.storage.local.set(partial, done);
      else chrome.storage.local.set(partial);
    } else {
      done?.();
    }
  };

  const handleStart = () => {
    if (!studySubject.trim()) {
      alert('Please enter a study subject');
      return;
    }
    const initialTime = studyTimer * 60;
    const subject = studySubject.trim();
    setSessionStarted(true);
    setIsRunning(true);
    setTimeRemaining(initialTime);
    persist(
      {
        sessionStarted: true,
        isRunning: true,
        timeRemaining: initialTime,
        studyTimer,
        studySubject: subject,
        currentTask: `Studying ${subject}`,
      },
      () => sendTimerMessage('START_TIMER')
    );
  };

  const handlePause = () => {
    setIsRunning(false);
    persist({ isRunning: false }, () => sendTimerMessage('PAUSE_TIMER'));
  };

  const handleResume = () => {
    setIsRunning(true);
    persist({ isRunning: true }, () => sendTimerMessage('RESUME_TIMER'));
  };

  const handleReset = () => {
    const resetTime = studyTimer * 60;
    setSessionStarted(false);
    setIsRunning(false);
    setTimeRemaining(resetTime);
    persist(
      {
        sessionStarted: false,
        isRunning: false,
        timeRemaining: resetTime,
        studyTimer,
      },
      () => sendTimerMessage('RESET_TIMER')
    );
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const showSetup = !sessionStarted;
  const canResume = sessionStarted && !isRunning && timeRemaining > 0;
  const sessionDone = sessionStarted && !isRunning && timeRemaining <= 0;

  return (
    <>
      {showSetup ? (
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
              value={studyTimerInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const v = e.target.value;
                setStudyTimerInput(v);
                const n = parseInt(v, 10);
                if (!Number.isNaN(n)) setStudyTimer(n);
              }}
              onBlur={() => {
                const n = parseInt(studyTimerInput, 10);
                const clamped = Number.isNaN(n) ? 25 : Math.min(120, Math.max(1, n));
                setStudyTimer(clamped);
                setStudyTimerInput(String(clamped));
                persist({ studyTimer: clamped });
              }}
              className="input-field"
            />
          </div>

          <button type="button" onClick={handleStart} className="btn btn-primary">
            Start Study Session
          </button>
        </div>
      ) : (
        <div className="timer-section">
          <div
            className={
              'timer-status ' +
              (isRunning
                ? 'timer-status--running'
                : canResume
                  ? 'timer-status--paused'
                  : 'timer-status--done')
            }
            role="status"
            aria-live="polite"
          >
            <span className="timer-status__dot" aria-hidden />
            {isRunning ? 'Focusing' : canResume ? 'Paused' : 'Session ended'}
          </div>

          <div className="timer-display">
            <div className="timer-ring-wrap">
              <div className="timer-ring">
                <div className="timer-ring__inner">
                  <span className="timer-text">{formatTime(timeRemaining)}</span>
                  <span className="timer-label">Remaining</span>
                </div>
              </div>
            </div>
            <div className="subject-display">
              <strong>Subject</strong> — {studySubject || '—'}
            </div>
          </div>

          <div className="timer-controls">
            {isRunning ? (
              <button type="button" onClick={handlePause} className="btn btn-secondary">
                Pause
              </button>
            ) : canResume ? (
              <button type="button" onClick={handleResume} className="btn btn-primary">
                Resume
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleReset}
              className={sessionDone ? 'btn btn-secondary' : 'btn btn-ghost'}
              title="End session and return to setup"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </>
  );
}
