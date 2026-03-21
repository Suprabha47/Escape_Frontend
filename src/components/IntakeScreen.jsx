/**
 * IntakeScreen.jsx
 * ================
 * Phase: "intake"
 * Accepts error prop and renders ErrorBanner when present.
 */

import ErrorBanner from "./ErrorBanner.jsx";
import styles from "./IntakeScreen.module.css";

export default function IntakeScreen({ goal, setGoal, onSubmit, loading, error, onDismissError }) {
  const handleKey = (e) => {
    if (e.key === "Enter" && goal.trim() && !loading) onSubmit();
  };

  const handleChange = (e) => {
    setGoal(e.target.value);
    if (error) onDismissError?.();
  };

  return (
    <div className={styles.intake}>
      <header className={styles.header}>
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
