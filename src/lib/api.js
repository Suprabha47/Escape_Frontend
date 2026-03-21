/**
 * lib/api.js
 * ==========
 * All calls to the FastAPI / Supabase backend.
 * Base URL is read from VITE_API_BASE_URL (default: http://localhost:8000).
 *
 * Exports:
 *   getOrCreateUserId()           → Promise<string>   (persists to localStorage)
 *   saveSession(sessionData)      → Promise<string>   session DB id
 *   completeSession(id, opts)     → Promise<{session, streak}>
 *   getStreak(userId)             → Promise<StreakData>
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const USER_KEY = "escape_user_id";

// ---------------------------------------------------------------------------
// User identity — anonymous, persisted to localStorage
// ---------------------------------------------------------------------------

/**
 * Returns the stored user ID if present, otherwise mints a new one
 * via POST /users and persists it.
 * @returns {Promise<string>}
 */
export async function getOrCreateUserId() {
  const stored = localStorage.getItem(USER_KEY);
  if (stored) return stored;

  const res  = await apiFetch("/users", { method: "POST" });
  const user = await res.json();
  localStorage.setItem(USER_KEY, user.id);
  return user.id;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * Persist a newly generated session to Supabase immediately after intake.
 *
 * @param {{
 *   userId: string,
 *   goal: string,
 *   steps: object[],
 *   energyLevel: number,
 *   lowPowerMode: boolean,
 *   fiveSecondStart: string,
 * }} data
 * @returns {Promise<string>} The Supabase session UUID
 */
export async function saveSession(data) {
  const res = await apiFetch("/sessions", {
    method: "POST",
    body: JSON.stringify({
      user_id:           data.userId,
      goal:              data.goal,
      steps_json:        data.steps,
      energy_level:      data.energyLevel ?? 5,
      low_power_mode:    data.lowPowerMode ?? false,
      five_second_start: data.fiveSecondStart ?? "",
    }),
  });
  const row = await res.json();
  return row.id;
}

/**
 * Mark a session complete and get back the recalculated streak.
 *
 * @param {string} sessionId   Supabase session UUID from saveSession()
 * @param {{ userId: string, stuckCount: number }} opts
 * @returns {Promise<{ session: object, streak: StreakData }>}
 */
export async function completeSession(sessionId, { userId, stuckCount = 0 }) {
  const res = await apiFetch(`/sessions/${sessionId}/complete`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, stuck_count: stuckCount }),
  });
  return res.json();
}

/**
 * Read the pre-computed streak for a user. O(1).
 *
 * @param {string} userId
 * @returns {Promise<StreakData>}
 */
export async function getStreak(userId) {
  const res = await apiFetch(`/users/${userId}/streak`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Internal fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Thin wrapper that adds Content-Type and throws on non-2xx.
 * Returns the raw Response so callers can .json() at their leisure.
 */
async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body?.detail ?? `API error ${res.status}`,
      res.status
    );
  }

  return res;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name   = "ApiError";
    this.status = status;
  }
}

/**
 * @typedef {{ current_streak: number, longest_streak: number, last_completed: string|null }} StreakData
 */
