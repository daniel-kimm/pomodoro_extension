import { addProductiveMinutes, initializeStreakData } from './streaks';

type TimerStorageState = {
  studyTimer?: unknown;
  studySubject?: unknown;
  isRunning?: unknown;
  timeRemaining?: unknown;
  sessionStarted?: unknown;
};

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function buildSessionKey(state: TimerStorageState): string | null {
  if (!isNumber(state.studyTimer)) return null;
  if (!isString(state.studySubject)) return null;

  const subject = state.studySubject.trim();
  if (!subject) return null;

  return `${subject}|${state.studyTimer}`;
}

async function maybeCountCompletedSession(state: TimerStorageState): Promise<void> {
  const sessionStarted = state.sessionStarted === true;
  const isRunning = state.isRunning === true;
  const timeRemaining = isNumber(state.timeRemaining) ? state.timeRemaining : null;
  const studyTimer = isNumber(state.studyTimer) ? state.studyTimer : null;

  if (!sessionStarted) return;
  if (isRunning) return;
  if (timeRemaining !== 0) return;
  if (studyTimer == null || studyTimer <= 0) return;

  const sessionKey = buildSessionKey(state);
  await addProductiveMinutes(studyTimer, sessionKey ?? undefined);
}

export function startStreakWatcher(): void {
  void initializeStreakData();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    const relevant =
      changes.sessionStarted ||
      changes.isRunning ||
      changes.timeRemaining ||
      changes.studyTimer ||
      changes.studySubject;

    if (!relevant) return;

    chrome.storage.local.get(
      ['sessionStarted', 'isRunning', 'timeRemaining', 'studyTimer', 'studySubject'],
      (result) => {
        void maybeCountCompletedSession(result);
      }
    );
  });
}
