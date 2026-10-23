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

import { useState, useRef, useCallback } from "react";
import { useEscapeSession }  from "./hooks/useEscapeSession.js";
import { useUsageLimit }     from "./hooks/useUsageLimit.js";

import IntakeScreen    from "./components/IntakeScreen.jsx";
import ChatPhase       from "./components/ChatPhase.jsx";
import ActionMode      from "./components/ActionMode.jsx";
import CompletionFlash from "./components/CompletionFlash.jsx";
import CompletionScreen from "./components/CompletionScreen.jsx";
import LimitScreen     from "./components/LimitScreen.jsx";
import ProfileModal    from "./components/ProfileModal.jsx";

import styles from "./App.module.css";

export default function App() {
  const flashRef = useRef(null);
  const { limitReached, incrementUsage } = useUsageLimit();
  const [profileOpen, setProfileOpen] = useState(false);

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
    userId,
    qCount,
    lowPowerMode,
    editStep,
    skipStep,
    setGoal,
    setChatInput,
    clearError,
    startChat,
    sendAnswer,
    generateNow,
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

  // Increment usage counter when a session actually kicks off (chat phase starts)
  const handleStart = useCallback(() => {
    incrementUsage();
    startChat();
  }, [incrementUsage, startChat]);

  const handleOpenProfile = useCallback(() => {
    setProfileOpen(true);
  }, []);

  const handleCloseProfile = useCallback(() => {
    setProfileOpen(false);
  }, []);

  return (
    <div className={styles.root}>
      {/* Film grain overlay */}
      <div className={styles.grain} aria-hidden="true" />

      {/* Burst canvas — always mounted so it never misses a flash */}
      <CompletionFlash ref={flashRef} />

      {/* Profile & History Modal */}
      <ProfileModal
        isOpen={profileOpen}
        onClose={handleCloseProfile}
        userId={userId}
        streak={streak}
      />

      {/* ── Limit gate ── */}
      {limitReached && <LimitScreen />}

      {/* ── Phase routing ── */}

      {!limitReached && phase === "intake" && (
        <IntakeScreen
          goal={goal}
          setGoal={setGoal}
          onSubmit={handleStart}
          loading={loading}
          error={error}
          streak={streak}
          onDismissError={dismissError}
          onOpenProfile={handleOpenProfile}
        />
      )}

      {phase === "chat" && (
        <ChatPhase
          goal={goal}
          displayMsgs={displayMsgs}
          chatInput={chatInput}
          setChatInput={setChatInput}
          onSend={sendAnswer}
          onGenerateNow={generateNow}
          qCount={qCount}
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
          lowPowerMode={lowPowerMode}
          onComplete={handleComplete}
          onStuck={handleStuck}
          onEditStep={editStep}
          onSkipStep={skipStep}
          onIdleReset={resetIdle}
        />
      )}

      {phase === "complete" && (
        <CompletionScreen
          streak={streak}
          onReset={reset}
          onOpenProfile={handleOpenProfile}
        />
      )}
    </div>
  );
}
