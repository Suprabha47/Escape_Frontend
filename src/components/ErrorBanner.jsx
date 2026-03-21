/**
 * ErrorBanner.jsx
 * ===============
 * Inline error display for recoverable errors (bad API key, network failure).
 * Shown inside IntakeScreen beneath the form when session.error is non-null.
 * Dismisses when the user edits their goal.
 */

import styles from "./ErrorBanner.module.css";

export default function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className={styles.banner} role="alert">
      <span className={styles.text}>{message}</span>
      {onDismiss && (
        <button className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss error">
          ×
        </button>
      )}
    </div>
  );
}
