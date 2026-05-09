import React, { useState, useEffect, useCallback } from 'react';

function sendTimerMessage(type: 'START_TIMER' | 'PAUSE_TIMER' | 'RESUME_TIMER' | 'RESET_TIMER'): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type });
  }
}

const TIMER_RING_RADIUS = 80;
const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * TIMER_RING_RADIUS;

export default function HomePage() {
  const [studyTimer, setStudyTimer] = useState<number>(25);
  const [studyTimerInput, setStudyTimerInput] = useState<string>('25');
  const [task, setTask] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(25 * 60);
  const [sessionStarted, setSessionStarted] = useState<boolean>(false);
  const [isEditingTask, setIsEditingTask] = useState<boolean>(false);

  const applyStorage = useCallback((result: { [key: string]: unknown }) => {
    if (result.studyTimer != null && typeof result.studyTimer === 'number') {
      setStudyTimer(result.studyTimer);
      setStudyTimerInput(String(result.studyTimer));
    }
    if (typeof result.task === 'string') setTask(result.task);
    if (typeof result.isRunning === 'boolean') setIsRunning(result.isRunning);
    if (typeof result.timeRemaining === 'number') setTimeRemaining(result.timeRemaining);
    if (typeof result.sessionStarted === 'boolean') setSessionStarted(result.sessionStarted);
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get(
      ['studyTimer', 'task', 'isRunning', 'timeRemaining', 'sessionStarted'],
      (result) => {
        applyStorage(result);
        const hasSession =
          result.sessionStarted === true ||
          (result.sessionStarted === undefined &&
            (result.isRunning === true ||
              ((result.timeRemaining ?? 0) > 0 && Boolean(result.task))));
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
      if (changes.task) setTask((changes.task.newValue as string) ?? '');
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
    if (!task.trim()) {
      alert('Please enter a focus task');
      return;
    }
    const initialTime = studyTimer * 60;
    const trimmedTask = task.trim().toUpperCase();
    setTask(trimmedTask);
    setSessionStarted(true);
    setIsRunning(true);
    setTimeRemaining(initialTime);
    persist(
      {
        sessionStarted: true,
        isRunning: true,
        timeRemaining: initialTime,
        studyTimer,
        task: trimmedTask,
      },
      () => sendTimerMessage('START_TIMER')
    );
  };

  const handleSaveTask = () => {
    const newTask = task.trim().toUpperCase();
    if (!newTask) return;

    persist({ task: newTask }, async () => {
      await fetch('http://localhost:3002/clear-cache', {
        method: 'POST',
      });

      chrome.runtime.sendMessage({
        type: 'STUDY_SESSION_UPDATE',
        task: newTask,
      });

      chrome.runtime.sendMessage({
        type: 'TASK_UPDATED'
      });
    });

    setIsEditingTask(false);
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

  const clampStudyTimer = (minutes: number): number => {
    return Math.min(120, Math.max(1, minutes));
  };

  const commitStudyTimerInput = () => {
    const n = parseInt(studyTimerInput, 10);
    const clamped = Number.isNaN(n) ? 25 : clampStudyTimer(n);
    setStudyTimer(clamped);
    setStudyTimerInput(String(clamped));
    persist({ studyTimer: clamped });
  };

  const stepStudyTimer = (delta: number) => {
    const parsed = parseInt(studyTimerInput, 10);
    const current = Number.isNaN(parsed) ? studyTimer : parsed;
    const next = clampStudyTimer(current + delta);
    setStudyTimer(next);
    setStudyTimerInput(String(next));
    persist({ studyTimer: next });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const showSetup = !sessionStarted;
  const canResume = sessionStarted && !isRunning && timeRemaining > 0;
  const sessionDone = sessionStarted && !isRunning && timeRemaining <= 0;
  const totalSessionSeconds = Math.max(1, studyTimer * 60);
  const timerProgress = Math.min(1, Math.max(0, timeRemaining / totalSessionSeconds));
  const timerProgressStyle = {
    strokeDasharray: TIMER_RING_CIRCUMFERENCE,
    strokeDashoffset: TIMER_RING_CIRCUMFERENCE * (1 - timerProgress),
  };

  return (
    <>
      {showSetup ? (
        <div className="setup-section">
          <div className="form-group">
            <label htmlFor="task">Focus Task</label>
            <input
              id="subject"
              type="text"
              placeholder="e.g., Study math"
              value={task}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTask(e.target.value)}
              className="input-field"
            />
          </div>

          <div className="form-group">
            <label htmlFor="timer">Study Timer (minutes)</label>
            <div className="number-stepper">
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
                onBlur={commitStudyTimerInput}
                className="input-field input-field--number"
              />
              <div className="number-stepper__controls">
                <button
                  type="button"
                  className="number-stepper__button"
                  onClick={() => stepStudyTimer(1)}
                  aria-label="Increase study timer"
                >
                  <svg viewBox="0 0 12 12" focusable="false">
                    <path d="M3 7.5 6 4.5l3 3" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="number-stepper__button"
                  onClick={() => stepStudyTimer(-1)}
                  aria-label="Decrease study timer"
                >
                  <svg viewBox="0 0 12 12" focusable="false">
                    <path d="M3 4.5 6 7.5l3-3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <button type="button" onClick={handleStart} className="btn btn-primary">
            Start Focus Session
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
                <svg className="timer-ring__svg" viewBox="0 0 170 170" aria-hidden="true">
                  <defs>
                    <linearGradient id="timer-ring-gradient" x1="20" y1="20" x2="150" y2="150">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="#a1a1aa" />
                    </linearGradient>
                  </defs>
                  <circle
                    className="timer-ring__track"
                    cx="85"
                    cy="85"
                    r={TIMER_RING_RADIUS}
                  />
                  <circle
                    className="timer-ring__progress"
                    cx="85"
                    cy="85"
                    r={TIMER_RING_RADIUS}
                    style={timerProgressStyle}
                  />
                </svg>
                <div className="timer-ring__inner">
                  <span className="timer-text">{formatTime(timeRemaining)}</span>
                  <span className="timer-label">Remaining</span>
                </div>
              </div>
            </div>
            <div className="subject-display">
              <strong>Task</strong> —{' '}
              {!isEditingTask ? (
                <>
                  {task ? task.toUpperCase() : '—'}
                  <button
                    type="button"
                    onClick={() => setIsEditingTask(true)}
                    className="btn btn-ghost task-inline-btn"
                  >
                    Edit Task
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    className="input-field"
                    style={{ width: '160px' }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveTask}
                    className="btn btn-primary"
                    style={{ marginTop: '10px', marginLeft: '6px', fontSize: '12px' }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingTask(false)}
                    className="btn btn-ghost"
                    style={{ marginTop: '8px', marginLeft: '4px', fontSize: '12px' }}
                  >
                    Cancel
                  </button>
                </>
              )}
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
