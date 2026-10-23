/**
 * ActionMode.jsx
 * ==============
 * Phase: "action"
 * Shows one step at a time. Handles idle ring, step transitions,
 * done button, stuck button, dot progress map, step editing, and skipping.
 */

import { useState, useRef, useEffect } from "react";
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
  lowPowerMode = false,
  onComplete,
  onStuck,
  onEditStep,
  onSkipStep,
  onIdleReset,
}) {
  const step = steps[visibleStep] ?? steps[currentStep];
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");

  // Monotonic progress: progress bar never regresses backwards when sub-steps are added
  const maxProgressRef = useRef(0);
  const rawProgress = steps.length ? (currentStep / steps.length) * 100 : 0;
  const progress = Math.min(100, Math.max(maxProgressRef.current, rawProgress));
  useEffect(() => {
    maxProgressRef.current = Math.max(maxProgressRef.current, rawProgress);
  }, [rawProgress]);

  useEffect(() => {
    if (step) {
      setEditText(step.text);
      setIsEditing(false);
    }
  }, [step]);

  if (!step) return null;

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (editText.trim() && onEditStep) {
      onEditStep(visibleStep, editText.trim());
      setIsEditing(false);
    }
  };

  return (
    <div className={styles.action} onClick={onIdleReset}>
      <div className={styles.inner}>

        {/* ── Top bar: step counter, low-power badge + idle ring ── */}
        <div className={styles.topBar}>
          <div className={styles.counterCluster}>
            <p className={styles.counter}>
              <em>{currentStep + 1}</em> of <em>{steps.length}</em>
            </p>
            {lowPowerMode && (
              <span className={styles.lowPowerBadge} title="Low-Power Mode: smaller steps & paced breathers">
                🌙 low-power
              </span>
            )}
          </div>

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

            {isEditing ? (
              <form onSubmit={handleSaveEdit} className={styles.editForm}>
                <textarea
                  className={styles.editInput}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                  rows={2}
                />
                <div className={styles.editActions}>
                  <button type="submit" className={styles.saveEditBtn}>save ✓</button>
                  <button type="button" className={styles.cancelEditBtn} onClick={() => setIsEditing(false)}>cancel</button>
                </div>
              </form>
            ) : (
              <div className={styles.textRow}>
                <p className={styles.stepText}>{step.text}</p>
                <button
                  type="button"
                  className={styles.editPencilBtn}
                  onClick={() => setIsEditing(true)}
                  title="Edit this step wording"
                  aria-label="Edit step"
                >
                  ✎
                </button>
              </div>
            )}

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

              {onSkipStep && (
                <button
                  type="button"
                  className={styles.skipBtn}
                  onClick={() => onSkipStep(visibleStep)}
                  title="Skip this step if not applicable"
                >
                  skip →
                </button>
              )}
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
