/**
 * ChatPhase.jsx
 * =============
 * Phase: "chat"
 * Shows the AI's clarifying questions and collects user answers.
 * One question visible at a time; user types and submits each answer.
 */

import { useRef, useEffect } from "react";
import styles from "./ChatPhase.module.css";

function TypingDots() {
  return (
    <span className={styles.typingDots}>
      <span />
      <span />
      <span />
    </span>
  );
}
 
export default function ChatPhase({
  goal,
  displayMsgs,
  chatInput,
  setChatInput,
  onSend,
  onGenerateNow,
  qCount = 1,
  loading,
}) {
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMsgs, loading]);

  // Auto-focus input when Claude finishes responding
  useEffect(() => {
    if (!loading && displayMsgs.length > 0) {
      inputRef.current?.focus();
    }
  }, [loading, displayMsgs.length]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (chatInput.trim() && !loading) onSend();
    }
  };

  // Extract active options from the most recent AI message
  const lastMsg = displayMsgs[displayMsgs.length - 1];
  const activeOptions = (!loading && lastMsg?.role === "ai" && Array.isArray(lastMsg.options) && lastMsg.options.length > 0)
    ? lastMsg.options
    : [];

  return (
    <div className={styles.chat}>
      <div className={styles.inner}>
        {/* Goal echo */}
        <p className={styles.goalEcho}>
          goal — <span>{goal}</span>
        </p>

        {/* Message thread */}
        <div className={styles.messages}>
          {displayMsgs.map((m, i) =>
            m.role === "ai" ? (
              <div key={i} className={styles.msgAi}>
                {m.content}
              </div>
            ) : (
              <div key={i} className={styles.msgUser}>
                {m.content}
              </div>
            )
          )}

          {loading && (
            <div className={styles.msgAi}>
              <TypingDots />
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Interactive input & suggestions section */}
        {!loading && displayMsgs.length > 0 && (
          <div className={styles.responseArea}>
            {/* Custom input row on top */}
            <div className={styles.inputRow}>
              <textarea
                ref={inputRef}
                className={styles.input}
                placeholder={activeOptions.length > 0 ? "type your answer, or select a suggestion below..." : "your answer..."}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKey}
                rows={1}
              />
              <button
                className={styles.sendBtn}
                onClick={() => onSend()}
                disabled={!chatInput.trim() || loading}
              >
                send →
              </button>
            </div>

            {/* Suggestions displayed under input */}
            {activeOptions.length > 0 && (
              <div className={styles.optionsWrap}>
                <p className={styles.optionsLabel}>Suggestions:</p>
                <div className={styles.optionsGrid}>
                  {activeOptions.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={styles.optionPill}
                      onClick={() => onSend(opt)}
                      disabled={loading}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Early bypass trigger: available after turn 3 */}
            {qCount >= 3 && onGenerateNow && (
              <div className={styles.bypassWrap}>
                <button
                  type="button"
                  className={styles.bypassBtn}
                  onClick={onGenerateNow}
                  title="Ready to begin? Skip remaining questions and create your steps"
                >
                  Ready? Generate steps now →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}