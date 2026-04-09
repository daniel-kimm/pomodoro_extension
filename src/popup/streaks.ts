export type StreakData = {
  dailyGoalMinutes: number;
  todayProductiveMinutes: number;
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string | null;
  todayCompleted: boolean;
  lastTrackedDate: string | null;
};

export const DEFAULT_STREAK_DATA: StreakData = {
  dailyGoalMinutes: 60,
  todayProductiveMinutes: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastCompletedDate: null,
  todayCompleted: false,
  lastTrackedDate: null,
};

const STREAK_STORAGE_KEY = "streakData";

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDateStringOffset(baseDateString: string, dayOffset: number): string {
  const base = new Date(`${baseDateString}T12:00:00`);
  base.setDate(base.getDate() + dayOffset);

  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function loadStreakData(): Promise<StreakData> {
  const result = await chrome.storage.local.get(STREAK_STORAGE_KEY);
  const stored = result[STREAK_STORAGE_KEY] as Partial<StreakData> | undefined;

  return {
    ...DEFAULT_STREAK_DATA,
    ...stored,
  };
}

export async function saveStreakData(data: StreakData): Promise<void> {
  await chrome.storage.local.set({
    [STREAK_STORAGE_KEY]: data,
  });
}

export function resetDailyProgressIfNeeded(data: StreakData, today = getTodayDateString()): StreakData {
  if (data.lastTrackedDate === today) {
    return data;
  }

  return {
    ...data,
    todayProductiveMinutes: 0,
    todayCompleted: false,
    lastTrackedDate: today,
  };
}

export function applyGoalCompletion(data: StreakData, today = getTodayDateString()): StreakData {
  if (data.todayCompleted) {
    return data;
  }

  if (data.todayProductiveMinutes < data.dailyGoalMinutes) {
    return data;
  }

  const yesterday = getDateStringOffset(today, -1);

  let nextStreak = 1;

  if (data.lastCompletedDate === today) {
    nextStreak = data.currentStreak;
  } else if (data.lastCompletedDate === yesterday) {
    nextStreak = data.currentStreak + 1;
  } else {
    nextStreak = 1;
  }

  return {
    ...data,
    todayCompleted: true,
    currentStreak: nextStreak,
    longestStreak: Math.max(data.longestStreak, nextStreak),
    lastCompletedDate: today,
  };
}

export async function initializeStreakData(): Promise<StreakData> {
  const loaded = await loadStreakData();
  const normalized = resetDailyProgressIfNeeded(loaded);

  await saveStreakData(normalized);
  return normalized;
}

export async function addProductiveMinutes(minutes: number): Promise<StreakData> {
  if (minutes <= 0) {
    return initializeStreakData();
  }

  const loaded = await loadStreakData();
  const reset = resetDailyProgressIfNeeded(loaded);
  const updated: StreakData = {
    ...reset,
    todayProductiveMinutes: reset.todayProductiveMinutes + minutes,
  };

  const completed = applyGoalCompletion(updated);
  await saveStreakData(completed);

  return completed;
}

export async function setDailyGoalMinutes(goal: number): Promise<StreakData> {
  const safeGoal = Math.max(1, Math.floor(goal));

  const loaded = await loadStreakData();
  const reset = resetDailyProgressIfNeeded(loaded);

  const updated: StreakData = {
    ...reset,
    dailyGoalMinutes: safeGoal,
  };

  const completed = applyGoalCompletion(updated);
  await saveStreakData(completed);

  return completed;
}

export function getRemainingMinutes(data: StreakData): number {
  return Math.max(0, data.dailyGoalMinutes - data.todayProductiveMinutes);
}

export function getProgressPercent(data: StreakData): number {
  if (data.dailyGoalMinutes <= 0) return 0;
  return Math.min(100, Math.round((data.todayProductiveMinutes / data.dailyGoalMinutes) * 100));
}
