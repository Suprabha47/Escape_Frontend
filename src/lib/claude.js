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
// Config from env
// ---------------------------------------------------------------------------
const ENDPOINT   = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT?.replace(/\/$/, "");
const API_KEY    = import.meta.env.VITE_AZURE_OPENAI_KEY;
const DEPLOYMENT = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT ?? "gpt-5.4-nano";
const API_VERSION = "2024-12-01-preview";

// ---------------------------------------------------------------------------
// Core call — uses Azure OpenAI REST API directly (no SDK needed in browser)
// ---------------------------------------------------------------------------

/**
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Promise<string>}
 */
export async function askClaude(messages) {
  if (!API_KEY) {
    throw new ClaudeError(
      "VITE_AZURE_OPENAI_KEY is not set. Add it to .env.local and restart Vite.",
      0,
      "missing_key"
    );
  }
  if (!ENDPOINT) {
    throw new ClaudeError(
      "VITE_AZURE_OPENAI_ENDPOINT is not set. Add it to .env.local and restart Vite.",
      0,
      "missing_key"
    );
  }

  const url = `${ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": API_KEY,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
      ],
      max_completion_tokens: 1500,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ClaudeError(
      err?.error?.message ?? `HTTP ${res.status}`,
      res.status
    );
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
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