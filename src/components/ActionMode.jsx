/**
 * ActionMode.jsx
 * ==============
 * Phase: "action"
 * Shows one step at a time. Handles idle ring, step transitions,
 * done button, stuck button, and dot progress map.
 *
 * Does NOT own the burst animation — that lives in CompletionFlash,
 * triggered by App.jsx when completeStep() returns the completed index.
 */

import styles from "./ActionMode.module.css";

// ── Constants ────────────────────────────────────────────────────────────────
const IDLE_TOTAL  = 300;
const RING_R      = 10;
const RING_CIRC   = 2 * Math.PI * RING_R;

// ── Idle Ring SVG ─────────────────────────────────────────────────────────────
function IdleRing({ seconds }) {
  const fraction   = seconds / IDLE_TOTAL;
  const dashOffset = RING_CIRC * (1 - fraction);
  const isWarn     = fraction < 0.4;
 
  return (
    <svg
      className={styles.idleRing}
      width="26"
      height="26"
      viewBox="0 0 26 26"
      aria-label={`Idle timer: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} remaining`}
    >
      <circle className={styles.ringTrack} cx="13" cy="13" r={RING_R} />
      <circle
        className={`${styles.ringFill} ${isWarn ? styles.ringWarn : ""}`}
        cx="13"
        cy="13"
        r={RING_R}
        strokeDasharray={RING_CIRC}
        strokeDashoffset={dashOffset}
      />
    </svg>
  );
}

// ── Progress dots ─────────────────────────────────────────────────────────────
function ProgressDots({ steps, currentStep }) {
  return (
    <div className={styles.dots} role="progressbar" aria-valuenow={currentStep + 1} aria-valuemax={steps.length}>
      {steps.map((step, i) => (
        <div
          key={step.id ?? i}
          className={[
            styles.dot,
            i < currentStep  ? styles.dotDone    : "",
            i === currentStep ? styles.dotCurrent : "",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ActionMode({
  steps,
  currentStep,
  visibleStep,
  cardAnim,
  idleSeconds,
  idleSurfaced,
  stuckLoading,
  onComplete,
  onStuck,
  onIdleReset,
}) {
  const step = steps[visibleStep] ?? steps[currentStep];
  if (!step) return null;

  const progress = steps.length ? (currentStep / steps.length) * 100 : 0;

  return (
    <div className={styles.action} onClick={onIdleReset}>
      <div className={styles.inner}>

        {/* ── Top bar: step counter + idle ring ── */}
        <div className={styles.topBar}>
          <p className={styles.counter}>
            <em>{currentStep + 1}</em> of <em>{steps.length}</em>
          </p>

          <div className={styles.idleCluster}>
            {idleSurfaced && (
              <span className={styles.idleWarning}>idle</span>
            )}
            <IdleRing seconds={idleSeconds} />
          </div>
        </div>

        {/* ── Animated step card ── */}
        <div className={styles.cardWrap}>
          <div
            className={`${styles.card} ${cardAnim === "enter" ? styles.cardEnter : cardAnim === "exit" ? styles.cardExit : ""}`}
            key={`${visibleStep}-${cardAnim}`}
          >
            <div className={styles.stepNumber}>
              {String(visibleStep + 1).padStart(2, "0")}
            </div>

            <p className={styles.stepText}>{step.text}</p>

            {step.duration && (
              <p className={styles.stepDuration}>{step.duration}</p>
            )}

            <div className={styles.btns}>
              <button
                className={styles.doneBtn}
                onClick={onComplete}
                aria-label="Mark this step complete"
              >
                done ✓
              </button>

              <button
                className={[
                  styles.stuckBtn,
                  idleSurfaced ? styles.stuckSurfaced : "",
                ].join(" ")}
                onClick={onStuck}
                disabled={stuckLoading}
                aria-label="I'm stuck — break this step down further"
              >
                {stuckLoading ? "thinking..." : "i'm stuck"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Progress section ── */}
        <div className={styles.progressSection}>
          <ProgressDots steps={steps} currentStep={currentStep} />

          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
