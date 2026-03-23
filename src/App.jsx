/**
 * App.jsx
 * =======
 * Root component.
 * - Holds the CompletionFlash ref (canvas must live at root level).
 * - Routes on phase.
 * - Wires completeStep → flash.
 * - Passes error state to IntakeScreen.
 * - Passes streak to CompletionScreen.
 *
 * All state lives in useEscapeSession.
 * All API calls live in lib/claude.js and lib/api.js.
 */

import { useRef, useCallback } from "react";
import { useEscapeSession }  from "./hooks/useEscapeSession.js";

import IntakeScreen    from "./components/IntakeScreen.jsx";
import ChatPhase       from "./components/ChatPhase.jsx";
import ActionMode      from "./components/ActionMode.jsx";
import CompletionFlash from "./components/CompletionFlash.jsx";
import CompletionScreen from "./components/CompletionScreen.jsx";

import styles from "./App.module.css";

export default function App() {
  const flashRef = useRef(null);

  const {
    phase,
    goal,
    error,
    displayMsgs,
    chatInput,
    steps,
    currentStep,
    visibleStep,
    cardAnim,
    loading,
    stuckLoading,
    idleSeconds,
    idleSurfaced,
    streak,
    setGoal,
    setChatInput,
    clearError,
    startChat,
    sendAnswer,
    completeStep,
    handleStuck,
    resetIdle,
    reset,
  } = useEscapeSession();

  // Wire completeStep → burst animation
  const handleComplete = useCallback(() => {
    const completedIndex = completeStep();
    flashRef.current?.flash(completedIndex);
  }, [completeStep]);

  const dismissError = useCallback(() => {
    clearError();
  }, [clearError]);

  return (
    <div className={styles.root}>
      {/* Film grain overlay */}
      <div className={styles.grain} aria-hidden="true" />

      {/* Burst canvas — always mounted so it never misses a flash */}
      <CompletionFlash ref={flashRef} />

      {/* ── Phase routing ── */}

      {phase === "intake" && (
        <IntakeScreen
          goal={goal}
          setGoal={setGoal}
          onSubmit={startChat}
          loading={loading}
          error={error}
          onDismissError={dismissError}
        />
      )}

      {phase === "chat" && (
        <ChatPhase
          goal={goal}
          displayMsgs={displayMsgs}
          chatInput={chatInput}
          setChatInput={setChatInput}
          onSend={sendAnswer}
          loading={loading}
        />
      )}

      {phase === "action" && steps.length > 0 && (
        <ActionMode
          steps={steps}
          currentStep={currentStep}
          visibleStep={visibleStep}
          cardAnim={cardAnim}
          idleSeconds={idleSeconds}
          idleSurfaced={idleSurfaced}
          stuckLoading={stuckLoading}
          onComplete={handleComplete}
          onStuck={handleStuck}
          onIdleReset={resetIdle}
        />
      )}

      {phase === "complete" && (
        <CompletionScreen streak={streak} onReset={reset} />
      )}
    </div>
  );
}
