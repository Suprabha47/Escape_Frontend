/**
 * CompletionScreen.jsx
 * ====================
 * Phase: "complete"
 * Fades in 950ms after the last step is marked done (matching the burst duration).
 * Shows streak data if available from Supabase.
 */

import styles from "./CompletionScreen.module.css";

export default function CompletionScreen({ streak, onReset, onOpenProfile }) {
  return (
    <div className={styles.complete}>
      <h2 className={styles.word}>Done.</h2>
      <p className={styles.sub}>you escaped</p>

      <div
        className={styles.streakWrap}
        onClick={onOpenProfile}
        title="View your streak record and history"
        role="button"
        tabIndex={0}
      >
        <div className={styles.streakRow}>
          <span className={styles.streakNum}>{streak?.current_streak ?? 1}</span>
          <span className={styles.streakLabel}>
            {(streak?.current_streak ?? 1) === 1 ? "day streak" : "day streak"}
          </span>
        </div>
        {(streak?.longest_streak ?? 0) > (streak?.current_streak ?? 1) && (
          <p className={styles.streakRecord}>
            best — {streak.longest_streak}
          </p>
        )}
      </div>

      <div className={styles.actions}>
        <button className={styles.historyBtn} onClick={onOpenProfile}>
          view task history ↗
        </button>
        <button className={styles.restart} onClick={onReset}>
          start again →
        </button>
      </div>
    </div>
  );
}
