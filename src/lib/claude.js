/**
 * lib/claude.js
 * =============
 * Communicates with the Escape backend (/chat and /stuck endpoints).
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/**
 * Send conversational turns to the backend /chat endpoint.
 *
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
 *
 * @param {number} stepId
 * @param {string} stepText
 * @param {string|null} sessionId
 * @returns {Promise<{parent_step_id: number, substeps: Array<{id: number|string, text: string, duration: string}>}>}
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

/**
 * Extract and normalize JSON from an AI response.
 * Handles both `steps` and `micro_steps` schemas seamlessly.
 *
 * @param {string} text
 * @returns {object|null}
 */
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

    // Normalize micro_steps <-> steps interoperability
    if (parsed.micro_steps && !parsed.steps) {
      parsed.steps = parsed.micro_steps;
    } else if (parsed.steps && !parsed.micro_steps) {
      parsed.micro_steps = parsed.steps;
    }

    return parsed;
  } catch {
    return null;
  }
}

export class ClaudeError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name   = "ClaudeError";
    this.status = status;
    this.code   = code ?? null;
  }
}
