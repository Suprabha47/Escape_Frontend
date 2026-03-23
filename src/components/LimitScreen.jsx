/**
 * LimitScreen.jsx
 * ===============
 * Shown when a visitor has used their 2 free sessions.
 * To bypass as owner: localStorage.setItem("escape_owner", "true") in DevTools console.
 */

import styles from "./LimitScreen.module.css";

export default function LimitScreen() {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.logo}>Escape</h1>
      <div className={styles.divider} />
      <p className={styles.msg}>you've used your free sessions</p>
      <p className={styles.sub}>
        this is a demo — reach out if you'd like full access
      </p>
    </div>
  );
}
