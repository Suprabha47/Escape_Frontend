/**
 * lib/claude.js — Azure OpenAI edition
 * =====================================
 * Drop-in replacement for the Anthropic version.
 * Uses Azure OpenAI (gpt-4.1-nano) via the openai JS SDK.
 *
 * Add to .env.local:
 *   VITE_AZURE_OPENAI_KEY=your-key-here
 *   VITE_AZURE_OPENAI_ENDPOINT=https://conta-mi05anpo-eastus2.cognitiveservices.azure.com/
 *   VITE_AZURE_OPENAI_DEPLOYMENT=gpt-5.4-nano
 */

// ---------------------------------------------------------------------------
// System prompt — identical behaviour, model-agnostic
// ---------------------------------------------------------------------------
export const SYSTEM_PROMPT = `You are the AI core of "Escape," an app for chronic procrastinators.

PHASE QUESTIONING:
Ask exactly 2-3 short, warm clarifying questions — one at a time.
Every question must feel like it was written specifically for this task. Never copy-paste generic phrasing.

Question 1 — THE BLOCKER:
Identify the emotional or practical friction point. Frame it around the specific task.
Ask what's making this hard to start, not just what's hard about it.
Examples:
  sleep task     → "What's keeping your mind from switching off right now?"
  work task      → "Which part of this are you most tempted to put off?"
  creative task  → "Where do you always seem to get stuck with this?"
  chore task     → "What's the most annoying part of actually starting this?"
  health task    → "What usually gets in the way when you try to do this?"

Question 2 — READINESS:
Ask how ready they feel — physically, mentally, or emotionally depending on the task type.
Always use a 1-10 scale but frame the dimension around the task.
Examples:
  mental task    → "How sharp does your brain feel right now, 1-10?"
  physical task  → "How does your body feel about doing this right now, 1-10?"
  emotional task → "How settled do you feel going into this, 1-10?"
  sleep task     → "How wound up is your mind right now, 1-10?"
  default        → "How much energy do you have for this right now, 1-10?"

Question 3 — RESOURCES (conditional):
Only ask if the task clearly requires specific tools, files, people, or locations.
Skip entirely for personal/internal tasks like sleep, mood, exercise, journaling.
When asked: name the specific resource inferred from the goal, don't ask generically.
Example: "Do you have your notes and the document open, or do you need to find them first?"

Keep questions warm and brief. One question per response.
CRITICAL: Questions must be plain text only — never JSON, never a dict, never wrapped in quotes or braces.
If you have multiple questions, ask only the FIRST one now. Wait for the answer before asking the next.

PHASE GENERATING (after receiving 2-3 answers):
Reply ONLY with valid JSON — no markdown, no prose before or after:
{"steps":[{"id":1,"text":"...","duration":"< 1 min"},...]}

Step rules:
- 10-15 steps total
- Step 1 must be trivially easy (5-10 seconds, zero decisions)
- Every step < 10 minutes
- Low energy (1-5) → smaller, gentler, more passive steps
- Durations: "< 1 min" | "2 min" | "5 min" | "8 min"
- Never use: "just", "simply", "easy", "quickly"
- Never use vague verbs: "think about", "consider", "brainstorm"

STUCK PHASE:
Reply ONLY with JSON:
{"substeps":[{"id":1,"text":"...","duration":"< 1 min"},{"id":2,...},{"id":3,...}]}
Sub-steps must be smaller in every dimension than the parent step.`;

// ---------------------------------------------------------------------------
// Config from env — routes to FastAPI backend
// ---------------------------------------------------------------------------
const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Core call — routes securely through the FastAPI backend
// ---------------------------------------------------------------------------

/**
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Promise<string>}
 */
export async function askClaude(messages) {
  try {
    const res = await fetch(`${BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ClaudeError(
        err?.detail ?? `HTTP ${res.status}`,
        res.status
      );
    }

    const data = await res.json();
    return data.reply ?? "";
  } catch (err) {
    if (err instanceof ClaudeError) throw err;
    throw new ClaudeError(
      "Could not connect to Escape backend. Please ensure the backend server is running.",
      0,
      "connection_error"
    );
  }
}

/**
 * Break down a stuck step using backend /stuck
 * @param {number} stepId
 * @param {string} stepText
 * @param {string|null} sessionId
 * @returns {Promise<{parent_step_id: number, substeps: Array<{id: number, text: string, duration: string}>}>}
 */
export async function askStuck(stepId, stepText, sessionId = null) {
  try {
    const res = await fetch(`${BASE}/stuck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step_id: stepId,
        step_text: stepText,
        session_id: sessionId,
      }),
    });

    if (!res.ok) throw new Error("Stuck call failed");
    return await res.json();
  } catch {
    return {
      parent_step_id: stepId,
      substeps: [
        { id: 1, text: `Focus on just the first tiny mechanical part of: ${stepText.slice(0, 35)}`, duration: "< 1 min" },
        { id: 2, text: "Spend 60 seconds on a rough start without judging", duration: "< 1 min" },
        { id: 3, text: "Take 2 minutes to bring this piece to a close", duration: "2 min" },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// JSON extractor
// ---------------------------------------------------------------------------
export function detectJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const keys = Object.keys(parsed);

    // Reject single-question objects: { "question": "..." }
    if (keys.length === 1 && parsed.question) return null;

    // Reject question-dict objects: { "question1": "...", "question2": "..." }
    if (keys.every((k) => /^question\d*$/i.test(k))) return null;

    return parsed;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Error type — unchanged
// ---------------------------------------------------------------------------
export class ClaudeError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name   = "ClaudeError";
    this.status = status;
    this.code   = code ?? null;
  }
}