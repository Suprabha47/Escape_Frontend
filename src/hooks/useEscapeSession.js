/**
 * hooks/useEscapeSession.js
 * =========================
 * Single state machine for the Escape session lifecycle.
 *
 * Phase machine:  intake → chat → action → complete
 *
 * Fixes applied vs. previous version:
 *   1. visibleStep sync effect uses a ref to avoid reading stale currentStep.
 *   2. Supabase user is fetched on mount; session is saved after intake and
 *      completed (with streak recalc) when the last step is done.
 *   3. streak and sessionDbId are exposed so App/Complete screen can display them.
 *   4. ClaudeError with code "missing_key" surfaces a readable error message
 *      rather than a silent "Connection failed."
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { askClaude, detectJson, ClaudeError } from "../lib/claude.js";
import { getOrCreateUserId, saveSession, completeSession, getStreak } from "../lib/api.js";

export const IDLE_TOTAL = 300; // 5 minutes

export function useEscapeSession() {
  // ── Phase & goal ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState("intake");
  const [goal, setGoal]   = useState("");
  const [error, setError] = useState(null); // surfaces to ErrorBanner

  // ── Chat ──────────────────────────────────────────────────────────────────
  const [messages, setMessages]         = useState([]);
  const [displayMsgs, setDisplayMsgs]   = useState([]);
  const [chatInput, setChatInput]       = useState("");
  const [qCount, setQCount]             = useState(0);

  // ── Action ────────────────────────────────────────────────────────────────
  const [steps, setSteps]               = useState([]);
  const [currentStep, setCurrentStep]   = useState(0);
  const [visibleStep, setVisibleStep]   = useState(0);
  const [cardAnim, setCardAnim]         = useState("enter");

  // ── Loading ───────────────────────────────────────────────────────────────
  const [loading, setLoading]           = useState(false);
  const [stuckLoading, setStuckLoading] = useState(false);

  // ── Idle ──────────────────────────────────────────────────────────────────
  const [idleSeconds, setIdleSeconds]   = useState(IDLE_TOTAL);
  const [idleSurfaced, setIdleSurfaced] = useState(false);
  const idleIntervalRef                 = useRef(null);

  // ── Supabase / persistence ────────────────────────────────────────────────
  const [userId, setUserId]             = useState(null);
  const [sessionDbId, setSessionDbId]   = useState(null); // Supabase session UUID
  const [streak, setStreak]             = useState(null);  // { current_streak, longest_streak }
  const stuckCountRef                   = useRef(0);

  // ── Ref mirror of currentStep (fixes stale closure in visibleStep effect) ─
  const currentStepRef = useRef(0);
  useEffect(() => { currentStepRef.current = currentStep; }, [currentStep]);

  // ── Bootstrap: get/create anonymous user on mount ────────────────────────
  useEffect(() => {
    getOrCreateUserId()
      .then(setUserId)
      .catch(() => {
        // Non-fatal: app works without Supabase, streaks just won't persist
        console.warn("Escape: could not connect to backend — streaks disabled.");
      });
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Idle timer — resets whenever phase or currentStep changes
  // ──────────────────────────────────────────────────────────────────────────
  const resetIdle = useCallback(() => {
    setIdleSeconds(IDLE_TOTAL);
    setIdleSurfaced(false);
  }, []);

  useEffect(() => {
    if (phase !== "action") {
      clearInterval(idleIntervalRef.current);
      return;
    }
    resetIdle();
    clearInterval(idleIntervalRef.current);
    idleIntervalRef.current = setInterval(() => {
      setIdleSeconds((s) => {
        const next = s - 1;
        if (next <= 0) { setIdleSurfaced(true); return 0; }
        return next;
      });
    }, 1000);
    return () => clearInterval(idleIntervalRef.current);
  }, [phase, currentStep, resetIdle]);

  // ──────────────────────────────────────────────────────────────────────────
  // Step card transition
  // ──────────────────────────────────────────────────────────────────────────
  const advanceTo = useCallback((next) => {
    setCardAnim("exit");
    setTimeout(() => {
      setVisibleStep(next);
      setCardAnim("enter");
    }, 340);
    resetIdle();
  }, [resetIdle]);

  // Sync visibleStep when entering action phase for the first time.
  // Uses ref to read currentStep without adding it as a dependency
  // (advanceTo owns all mid-session updates).
  useEffect(() => {
    if (phase === "action") {
      setVisibleStep(currentStepRef.current);
      setCardAnim("enter");
    }
  }, [phase]);

  // ──────────────────────────────────────────────────────────────────────────
  // Enter action mode + optionally save session to Supabase
  // ──────────────────────────────────────────────────────────────────────────
  const enterAction = useCallback(async (parsed, goalText) => {
    setSteps(parsed.steps);
    setCurrentStep(0);
    setVisibleStep(0);
    setCardAnim("enter");
    stuckCountRef.current = 0;
    setPhase("action");

    // Best-effort: save to Supabase (non-blocking, non-fatal)
    if (userId) {
      saveSession({
        userId,
        goal: goalText,
        steps: parsed.steps,
        energyLevel: parsed.energy_level ?? 5,
        lowPowerMode: parsed.low_power_mode ?? false,
        fiveSecondStart: parsed.five_second_start ?? "",
      })
        .then((id) => setSessionDbId(id))
        .catch((e) => console.warn("Escape: session save failed", e));
    }
  }, [userId]);

  // ──────────────────────────────────────────────────────────────────────────
  // startChat
  // ──────────────────────────────────────────────────────────────────────────
  const startChat = useCallback(async () => {
    if (!goal.trim() || loading) return;
    setError(null);
    setLoading(true);
    setPhase("chat");

    const userMsg = { role: "user", content: `My goal: ${goal.trim()}` };
    const newMsgs = [userMsg];
    setMessages(newMsgs);
    setDisplayMsgs([]);

    try {
      const reply  = await askClaude(newMsgs);
      const parsed = detectJson(reply);
      if (parsed?.steps) {
        await enterAction(parsed, goal.trim());
      } else {
        setMessages([...newMsgs, { role: "assistant", content: reply }]);
        setDisplayMsgs([{ role: "ai", content: reply }]);
        setQCount(1);
      }
    } catch (e) {
      const msg = e instanceof ClaudeError && e.code === "missing_key"
        ? e.message
        : "Connection failed. Please check your API key and try again.";
      setError(msg);
      setPhase("intake");
    } finally {
      setLoading(false);
    }
  }, [goal, loading, enterAction]);

  // ──────────────────────────────────────────────────────────────────────────
  // sendAnswer
  // ──────────────────────────────────────────────────────────────────────────
  const sendAnswer = useCallback(async () => {
    if (!chatInput.trim() || loading) return;

    const answer = chatInput.trim();
    setChatInput("");

    const nd = [...displayMsgs, { role: "user", content: answer }];
    setDisplayMsgs(nd);

    const nm = [...messages, { role: "user", content: answer }];
    setMessages(nm);
    setLoading(true);

    try {
      const toSend = qCount >= 2
        ? [...nm, { role: "user", content: "Generate the atomic steps JSON now." }]
        : nm;

      const reply  = await askClaude(toSend);
      const parsed = detectJson(reply);

      if (parsed?.steps) {
        await enterAction(parsed, goal);
      } else {
        setMessages([...nm, { role: "assistant", content: reply }]);
        setDisplayMsgs([...nd, { role: "ai", content: reply }]);
        setQCount((q) => q + 1);
      }
    } catch (e) {
      setDisplayMsgs((d) => [
        ...d,
        { role: "ai", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [chatInput, loading, displayMsgs, messages, qCount, goal, enterAction]);

  // ──────────────────────────────────────────────────────────────────────────
  // completeStep — returns completed index for CompletionFlash
  // ──────────────────────────────────────────────────────────────────────────
  const completeStep = useCallback(() => {
    const completedIndex = currentStep;
    const next = currentStep + 1;
    const isLast = next >= steps.length;

    if (isLast) {
      // Delay phase change so the burst animation has time to run
      setTimeout(async () => {
        setPhase("complete");

        // Best-effort Supabase completion + streak recalc
        if (sessionDbId && userId) {
          try {
            const result = await completeSession(sessionDbId, {
              userId,
              stuckCount: stuckCountRef.current,
            });
            setStreak(result.streak);
          } catch (e) {
            // Fall back to a plain GET if the complete endpoint fails
            try {
              const s = await getStreak(userId);
              setStreak(s);
            } catch {}
          }
        }
      }, 950);
    } else {
      setTimeout(() => {
        setCurrentStep(next);
        advanceTo(next);
      }, 200);
    }

    return completedIndex;
  }, [currentStep, steps.length, advanceTo, sessionDbId, userId]);

  // ──────────────────────────────────────────────────────────────────────────
  // handleStuck
  // ──────────────────────────────────────────────────────────────────────────
  const handleStuck = useCallback(async () => {
    if (stuckLoading) return;
    setStuckLoading(true);
    resetIdle();
    stuckCountRef.current += 1;

    const stuckStep = steps[currentStep];

    try {
      const reply = await askClaude([
        ...messages,
        {
          role: "user",
          content: `I'm stuck on: "${stuckStep.text}". Break into exactly 3 smaller sub-steps. JSON only: {"substeps":[...]}`,
        },
      ]);

      const parsed = detectJson(reply);
      if (parsed?.substeps) {
        const updated = [...steps];
        updated.splice(currentStep, 1,
          ...parsed.substeps.map((s, i) => ({
            id:       `sub-${currentStep}-${i}`,
            text:     s.text,
            duration: s.duration ?? "< 1 min",
          }))
        );
        setSteps(updated);
        setCardAnim("enter");
      }
    } catch {
      // Silent — user can retry
    } finally {
      setStuckLoading(false);
    }
  }, [stuckLoading, steps, currentStep, messages, resetIdle]);

  // ──────────────────────────────────────────────────────────────────────────
  // reset
  // ──────────────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setPhase("intake");
    setGoal("");
    setError(null);
    setMessages([]);
    setDisplayMsgs([]);
    setChatInput("");
    setSteps([]);
    setCurrentStep(0);
    setVisibleStep(0);
    setQCount(0);
    setSessionDbId(null);
    stuckCountRef.current = 0;
    resetIdle();
  }, [resetIdle]);

  // ──────────────────────────────────────────────────────────────────────────
  return {
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
    stuckCount: stuckCountRef.current,
    // actions
    setGoal,
    setChatInput,
    startChat,
    sendAnswer,
    completeStep,
    handleStuck,
    resetIdle,
    reset,
  };
}
