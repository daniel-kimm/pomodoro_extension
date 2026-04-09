import type { StreakData } from "./streaks";
import { getProgressPercent, getRemainingMinutes } from "./streaks";

type StreakCardProps = {
  data: StreakData;
};

export default function StreakCard({ data }: StreakCardProps) {
  const remaining = getRemainingMinutes(data);
  const progress = getProgressPercent(data);

  let statusMessage = `${remaining} more minute${remaining === 1 ? "" : "s"} to save your streak`;

  if (data.todayCompleted) {
    statusMessage = "Streak saved for today";
  }

  return (
    <section className="streak-card">
      <div className="streak-card__header">
        <div>
          <p className="streak-card__eyebrow">Daily Streak</p>
          <h2 className="streak-card__title"> {data.currentStreak} day{data.currentStreak === 1 ? "" : "s"}</h2>
        </div>

        <div className="streak-card__best">
          <span>Best</span>
          <strong>{data.longestStreak}</strong>
        </div>
      </div>

      <div className="streak-card__progress-row">
        <span>
          {data.todayProductiveMinutes} / {data.dailyGoalMinutes} productive minutes
        </span>
        <span>{progress}%</span>
      </div>

      <div className="streak-card__bar">
        <div
          className="streak-card__bar-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className={`streak-card__status ${data.todayCompleted ? "streak-card__status--complete" : ""}`}>
        {statusMessage}
      </p>
    </section>
  );
}
