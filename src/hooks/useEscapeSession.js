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
import { askClaude, askStuck, detectJson, ClaudeError } from "../lib/claude.js";
import { getOrCreateUserId, saveSession, completeSession, getStreak } from "../lib/api.js";

/**
 * Extracts question text and clickable options array from raw AI output or JSON.
 */
function extractQuestionData(text, qIndex = 0) {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed.question) {
        return {
          question: parsed.question,
          options: Array.isArray(parsed.options) && parsed.options.length > 0 ? parsed.options : []
        };
      }
      const keys = Object.keys(parsed).sort();
      if (keys.length > 0 && /^question/i.test(keys[0])) {
        return {
          question: parsed[keys[0]],
          options: Array.isArray(parsed.options) ? parsed.options : []
        };
      }
    } catch {}
  }

  // Raw plain text cleanup
  const clean = text.replace(/^[\s"'{]+|[\s"'}]+\s*$/g, "").trim();

  // Smart default options if AI didn't provide any
  let fallbackOptions = [];
  if (qIndex === 5) {
    fallbackOptions = ["15 min quick sprint", "30 minutes solid", "45 to 60 minutes", "Open-ended deep focus"];
  } else if (qIndex === 6) {
    fallbackOptions = ["Drained / Foggy (1-3)", "Neutral / Steady (4-6)", "High Energy / Focused (7-10)"];
  }

  return {
    question: clean,
    options: fallbackOptions
  };
}

export const IDLE_TOTAL = 300; // 5 minutes

export function useEscapeSession() {
  // ── Phase & goal ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState("intake");
  const [goal, setGoal]   = useState("");
  const [error, setError] = useState(null); // surfaces to ErrorBanner

  // Expose a stable clearError action
  const clearError = useCallback(() => setError(null), []);

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

  // ── Bootstrap: get/create anonymous user & streak on mount ───────────────
  useEffect(() => {
    getOrCreateUserId()
      .then((id) => {
        setUserId(id);
        getStreak(id)
          .then((s) => {
            if (s) setStreak(s);
          })
          .catch(() => {});
      })
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

    // Best-effort: persist session to Supabase via backend (non-fatal)
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
      const isBlueprint = parsed?.steps && Array.isArray(parsed.steps) && parsed.steps.length >= 1 && parsed.steps[0]?.text;
      if (isBlueprint) {
        await enterAction(parsed, goal.trim());
      } else {
        const data = extractQuestionData(reply, 1);
        setMessages([...newMsgs, { role: "assistant", content: reply }]);
        setDisplayMsgs([{ role: "ai", content: data.question, options: data.options }]);
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
  // sendAnswer — supports typing in textarea or clicking an option pill
  // ──────────────────────────────────────────────────────────────────────────
  const sendAnswer = useCallback(async (explicitAnswer) => {
    const rawAnswer = typeof explicitAnswer === "string" ? explicitAnswer : chatInput;
    if (!rawAnswer.trim() || loading) return;

    const answer = rawAnswer.trim();
    setChatInput("");

    const nd = [...displayMsgs, { role: "user", content: answer }];
    setDisplayMsgs(nd);

    const nm = [...messages, { role: "user", content: answer }];
    setMessages(nm);
    setLoading(true);

    try {
      // After question 6 has been answered, request the blueprint
      const toSend = qCount >= 6
        ? [...nm, { role: "user", content: "Generate the atomic steps JSON now." }]
        : nm;

      const reply  = await askClaude(toSend);
      const parsed = detectJson(reply);
      const isBlueprint = parsed?.steps && Array.isArray(parsed.steps) && parsed.steps.length >= 1 && parsed.steps[0]?.text;

      if (isBlueprint) {
        await enterAction(parsed, goal);
      } else {
        const nextQCount = qCount + 1;
        const data = extractQuestionData(reply, nextQCount);
        setMessages([...nm, { role: "assistant", content: reply }]);
        setDisplayMsgs([...nd, { role: "ai", content: data.question, options: data.options }]);
        setQCount(nextQCount);
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
  // generateNow — early bypass to jump straight to steps from turn 3 onwards
  // ──────────────────────────────────────────────────────────────────────────
  const generateNow = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    const nm = [...messages, { role: "user", content: "Generate the atomic steps JSON now." }];
    setMessages(nm);

    try {
      const reply = await askClaude(nm);
      const parsed = detectJson(reply);
      const isBlueprint = parsed?.steps && Array.isArray(parsed.steps) && parsed.steps.length >= 1 && parsed.steps[0]?.text;
      if (isBlueprint) {
        await enterAction(parsed, goal);
      } else {
        // Fallback: parse whatever steps exist
        await enterAction({ steps: [] }, goal);
      }
    } catch {
      setDisplayMsgs((d) => [
        ...d,
        { role: "ai", content: "Could not generate steps right now. Please try again." }
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, goal, enterAction]);

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

        // Complete session and recalculate streak
        if (userId) {
          try {
            let activeDbId = sessionDbId;
            if (!activeDbId) {
              activeDbId = await saveSession({
                userId,
                goal: goal || "Completed session",
                steps,
                energyLevel: 5,
                lowPowerMode: false,
                fiveSecondStart: "",
              });
              setSessionDbId(activeDbId);
            }
            const result = await completeSession(activeDbId, {
              userId,
              stuckCount: stuckCountRef.current,
            });
            if (result?.streak) {
              setStreak(result.streak);
            }
          } catch (e) {
            // Fall back to a plain GET if the complete endpoint fails
            try {
              const s = await getStreak(userId);
              if (s) setStreak(s);
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
  }, [currentStep, steps, advanceTo, sessionDbId, userId, goal]);

  // ──────────────────────────────────────────────────────────────────────────
  // handleStuck
  // ──────────────────────────────────────────────────────────────────────────
  const handleStuck = useCallback(async () => {
    if (stuckLoading) return;
    setStuckLoading(true);
    resetIdle();
    stuckCountRef.current += 1;

    const stuckStep = steps[currentStep];
    if (!stuckStep) {
      setStuckLoading(false);
      return;
    }

    try {
      const res = await askStuck(currentStep + 1, stuckStep.text, sessionDbId);
      if (res?.substeps && res.substeps.length > 0) {
        const updated = [...steps];
        updated.splice(
          currentStep,
          1,
          ...res.substeps.map((s, i) => ({
            id: `sub-${currentStep}-${i}`,
            text: s.text,
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
  }, [stuckLoading, steps, currentStep, sessionDbId, resetIdle]);

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
    userId,
    qCount,
    stuckCount: stuckCountRef.current,
    // actions
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
  };
}
