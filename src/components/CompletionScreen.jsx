/**
 * CompletionScreen.jsx
 * ====================
 * Phase: "complete"
 * Fades in 950ms after the last step is marked done (matching the burst duration).
 * Shows streak data if available from Supabase.
 */

import styles from "./CompletionScreen.module.css";

export default function CompletionScreen({ streak, onReset }) {
  return (
    <div className={styles.complete}>
      <h2 className={styles.word}>Done.</h2>
      <p className={styles.sub}>you escaped</p>

      {streak && (
        <div className={styles.streakWrap}>
          <div className={styles.streakRow}>
            <span className={styles.streakNum}>{streak.current_streak}</span>
            <span className={styles.streakLabel}>
              {streak.current_streak === 1 ? "day streak" : "day streak"}
            </span>
          </div>
          {streak.longest_streak > streak.current_streak && (
            <p className={styles.streakRecord}>
              best — {streak.longest_streak}
            </p>
          )}
        </div>
      )}

      <button className={styles.restart} onClick={onReset}>
        start again →
      </button>
    </div>
  );
}
