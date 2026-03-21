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
Ask 2-3 short empathetic clarifying questions, one at a time:
1. The most annoying/blocking part of the task
2. Energy level 1-10 right now
3. Whether they have what they need to start (optional — omit if not relevant)

Keep questions warm and brief. One question per response.

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
// JSON extractor — unchanged
// ---------------------------------------------------------------------------
export function detectJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
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