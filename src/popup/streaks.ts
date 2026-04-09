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
