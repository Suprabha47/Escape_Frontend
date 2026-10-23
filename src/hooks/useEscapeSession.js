/**
 * hooks/useEscapeSession.js
 * =========================
 * Single state machine for the Escape session lifecycle.
 *
 * Phase machine:  intake → chat → action → complete
 *
 * Features:
 *   1. Synchronous state machine with ref mirroring to prevent stale closures.
 *   2. Supabase/SQLite persistence with live sub-step synchronization.
 *   3. Session crash recovery and resumption via localStorage.
 *   4. Low-Power Mode tracking and pacing cues.
 *   5. Web Audio API chime on step checkoff and victory fanfare.
 *   6. Step editing and skipping capabilities.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { askClaude, askStuck, detectJson, ClaudeError } from "../lib/claude.js";
import {
  getOrCreateUserId,
  saveSession,
  completeSession,
  getStreak,
  updateSessionSteps,
} from "../lib/api.js";
import { playStepChime, playCompleteFanfare } from "../lib/sound.js";

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
          options: Array.isArray(parsed.options) && parsed.options.length > 0 ? parsed.options : [],
        };
      }
      const keys = Object.keys(parsed).sort();
      if (keys.length > 0 && /^question/i.test(keys[0])) {
        return {
          question: parsed[keys[0]],
          options: Array.isArray(parsed.options) ? parsed.options : [],
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
    options: fallbackOptions,
  };
}

export const IDLE_TOTAL = 300; // 5 minutes
const ACTIVE_SESSION_KEY = "escape_active_session";

export function useEscapeSession() {
  // ── Phase & goal ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState("intake");
  const [goal, setGoal]   = useState("");
  const [error, setError] = useState(null);

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
  const [lowPowerMode, setLowPowerMode] = useState(false);

  // ── Loading ───────────────────────────────────────────────────────────────
  const [loading, setLoading]           = useState(false);
  const [stuckLoading, setStuckLoading] = useState(false);

  // ── Idle ──────────────────────────────────────────────────────────────────
  const [idleSeconds, setIdleSeconds]   = useState(IDLE_TOTAL);
  const [idleSurfaced, setIdleSurfaced] = useState(false);
  const idleIntervalRef                 = useRef(null);

  // ── Supabase / persistence ────────────────────────────────────────────────
  const [userId, setUserId]             = useState(null);
  const [sessionDbId, setSessionDbId]   = useState(null);
  const [streak, setStreak]             = useState(null);
  const stuckCountRef                   = useRef(0);

  // ── Ref mirror of currentStep (fixes stale closure) ──────────────────────
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
        console.warn("Escape: could not connect to backend — streaks disabled.");
      });
  }, []);

  // ── Session Crash Recovery: Restore from localStorage on mount ────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.phase === "action" && Array.isArray(data.steps) && data.steps.length > 0) {
          setPhase("action");
          setGoal(data.goal || "");
          setSteps(data.steps);
          setCurrentStep(data.currentStep || 0);
          setVisibleStep(data.currentStep || 0);
          setSessionDbId(data.sessionDbId || null);
          setLowPowerMode(Boolean(data.lowPowerMode));
        } else if (data.phase === "chat" && Array.isArray(data.displayMsgs) && data.displayMsgs.length > 0) {
          setPhase("chat");
          setGoal(data.goal || "");
          setMessages(data.messages || []);
          setDisplayMsgs(data.displayMsgs || []);
          setQCount(data.qCount || 1);
        }
      }
    } catch (e) {
      console.warn("Escape: session restoration failed", e);
    }
  }, []);

  // ── Session Auto-Sync to localStorage ────────────────────────────────────
  useEffect(() => {
    try {
      if (phase === "action" && steps.length > 0) {
        localStorage.setItem(
          ACTIVE_SESSION_KEY,
          JSON.stringify({
            phase: "action",
            goal,
            steps,
            currentStep,
            sessionDbId,
            lowPowerMode,
          })
        );
      } else if (phase === "chat" && displayMsgs.length > 0) {
        localStorage.setItem(
          ACTIVE_SESSION_KEY,
          JSON.stringify({
            phase: "chat",
            goal,
            messages,
            displayMsgs,
            qCount,
          })
        );
      } else if (phase === "complete" || phase === "intake") {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
    } catch {}
  }, [phase, goal, steps, currentStep, sessionDbId, lowPowerMode, messages, displayMsgs, qCount]);

  // ──────────────────────────────────────────────────────────────────────────
  // Idle timer
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
    const rawSteps = parsed.steps || parsed.micro_steps || [];
    setSteps(rawSteps);
    setCurrentStep(0);
    setVisibleStep(0);
    setCardAnim("enter");
    setLowPowerMode(Boolean(parsed.low_power_mode));
    stuckCountRef.current = 0;
    setPhase("action");

    if (userId) {
      saveSession({
        userId,
        goal: goalText,
        steps: rawSteps,
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
        : "Connection failed. Please ensure the backend is running.";
      setError(msg);
      setPhase("intake");
    } finally {
      setLoading(false);
    }
  }, [goal, loading, enterAction]);

  // ──────────────────────────────────────────────────────────────────────────
  // sendAnswer
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
  // generateNow — early bypass
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
        await enterAction({ steps: [] }, goal);
      }
    } catch {
      setDisplayMsgs((d) => [
        ...d,
        { role: "ai", content: "Could not generate steps right now. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, goal, enterAction]);

  // ──────────────────────────────────────────────────────────────────────────
  // completeStep
  // ──────────────────────────────────────────────────────────────────────────
  const completeStep = useCallback(() => {
    const completedIndex = currentStep;
    const next = currentStep + 1;
    const isLast = next >= steps.length;

    if (isLast) {
      playCompleteFanfare();
      setTimeout(async () => {
        setPhase("complete");
        localStorage.removeItem(ACTIVE_SESSION_KEY);

        if (userId) {
          try {
            let activeDbId = sessionDbId;
            if (!activeDbId) {
              activeDbId = await saveSession({
                userId,
                goal: goal || "Completed session",
                steps,
                energyLevel: 5,
                lowPowerMode,
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
            try {
              const s = await getStreak(userId);
              if (s) setStreak(s);
            } catch {}
          }
        }
      }, 950);
    } else {
      playStepChime();
      setTimeout(() => {
        setCurrentStep(next);
        advanceTo(next);
      }, 200);
    }

    return completedIndex;
  }, [currentStep, steps, advanceTo, sessionDbId, userId, goal, lowPowerMode]);

  // ──────────────────────────────────────────────────────────────────────────
  // handleStuck — with dynamic database synchronization
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

        // Sync with backend DB so task history reflects the breakdown
        if (sessionDbId) {
          updateSessionSteps(sessionDbId, updated).catch((e) =>
            console.warn("Escape: updateSessionSteps failed", e)
          );
        }
      }
    } catch {
      // Silent
    } finally {
      setStuckLoading(false);
    }
  }, [stuckLoading, steps, currentStep, sessionDbId, resetIdle]);

  // ──────────────────────────────────────────────────────────────────────────
  // editStep & skipStep
  // ──────────────────────────────────────────────────────────────────────────
  const editStep = useCallback((index, newText) => {
    if (!newText || !newText.trim()) return;
    setSteps((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], text: newText.trim() };
        if (sessionDbId) {
          updateSessionSteps(sessionDbId, next).catch(() => {});
        }
      }
      return next;
    });
  }, [sessionDbId]);

  const skipStep = useCallback((index) => {
    const next = index + 1;
    if (next >= steps.length) {
      completeStep();
    } else {
      setCurrentStep(next);
      advanceTo(next);
    }
  }, [steps.length, completeStep, advanceTo]);

  // ──────────────────────────────────────────────────────────────────────────
  // reset
  // ──────────────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
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
    setLowPowerMode(false);
    stuckCountRef.current = 0;
    resetIdle();
  }, [resetIdle]);

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
    lowPowerMode,
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
    editStep,
    skipStep,
    resetIdle,
    reset,
  };
}
