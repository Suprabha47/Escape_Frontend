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
  console.log("Display msgs: ",displayMsgs.content.question)

  return (
    <div className={styles.chat}>
      <div className={styles.inner}>
        {/* Goal echo */}
        <p className={styles.goalEcho}>
          goal — <span>{goal}</span>
        </p>

        {/* Message thread */}
        <div className={styles.messages}>
          {displayMsgs.map((m, i) => {
            let content = m.content;
            try {
              const parsed = JSON.parse(m.content);
              if (parsed.question) content = parsed.question;
              else if (parsed.steps) content = null; 
            } catch {
            }

            if (content === null) return null;

            return m.role === "ai" ? (
              <div key={i} className={styles.msgAi}>
                {content}
              </div>
            ) : (
              <div key={i} className={styles.msgUser}>
                {m.content}
              </div>
            );
          })}

          {loading && (
            <div className={styles.msgAi}>
              <TypingDots />
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input row — only shown when Claude is not thinking */}
        {!loading && displayMsgs.length > 0 && (
          <div className={styles.inputRow}>
            <textarea
              ref={inputRef}
              className={styles.input}
              placeholder="your answer..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
            />
            <button
              className={styles.sendBtn}
              onClick={onSend}
              disabled={!chatInput.trim() || loading}
            >
              send →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
