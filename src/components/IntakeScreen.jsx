/**
 * IntakeScreen.jsx
 * ================
 * Phase: "intake"
 * Accepts error prop and renders ErrorBanner when present.
 */

import ErrorBanner from "./ErrorBanner.jsx";
import styles from "./IntakeScreen.module.css";

export default function IntakeScreen({
  goal,
  setGoal,
  onSubmit,
  loading,
  error,
  streak,
  onDismissError,
  onOpenProfile,
}) {
  const handleKey = (e) => {
    if (e.key === "Enter" && goal.trim() && !loading) onSubmit();
  };

  const handleChange = (e) => {
    setGoal(e.target.value);
    if (error) onDismissError?.();
  };

  const currentStreak = streak?.current_streak ?? 0;
  const longestStreak = streak?.longest_streak ?? 0;

  return (
    <div className={styles.intake}>
      <header className={styles.header}>
        <div className={styles.topActions}>
          <div 
            className={`${styles.streakBadge} ${currentStreak > 0 ? styles.streakBadgeActive : ""}`}
            title={currentStreak > 0 ? `${currentStreak} day streak active!` : "Complete a task to build your streak"}
            onClick={onOpenProfile}
            role="button"
            tabIndex={0}
          >
            <span className={styles.streakIcon} aria-hidden="true">🔥</span>
            <span className={styles.streakCount}>{currentStreak}</span>
            <span className={styles.streakLabel}>day streak</span>
            {longestStreak > currentStreak && (
              <span className={styles.streakBest}>· best {longestStreak}</span>
            )}
          </div>

          <button
            className={styles.profileBtn}
            onClick={onOpenProfile}
            title="View past completed tasks & profile"
          >
            <span className={styles.profileIcon}>👤</span>
            <span>History</span>
          </button>
        </div>

        <h1 className={styles.logo}>Escape</h1>
        <p className={styles.logosub}>break the paralysis</p>
      </header>

      <div className={styles.divider} />

      <p className={styles.prompt}>what are you avoiding?</p>

      <div className={styles.form}>
        <input
          className={styles.input}
          placeholder="write your task here"
          value={goal}
          onChange={handleChange}
          onKeyDown={handleKey}
          autoFocus
          autoComplete="off"
          spellCheck="false"
        />

        <ErrorBanner message={error} onDismiss={onDismissError} />

        <button
          className={styles.btn}
          onClick={onSubmit}
          disabled={!goal.trim() || loading}
        >
          {loading ? "connecting..." : "begin →"}
        </button>
      </div>
    </div>
  );
}
