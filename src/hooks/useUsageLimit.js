/**
 * hooks/useUsageLimit.js
 * ======================
 * Tracks how many sessions a visitor has started.
 * Owners bypass the limit by having "escape_owner=true" in localStorage.
 *
 * To unlock your own browser, run in DevTools console:
 *   localStorage.setItem("escape_owner", "true")
 *
 * To reset a user count (testing):
 *   localStorage.removeItem("escape_usage")
 */

import { useState, useCallback } from "react";

const LIMIT     = 2;
const COUNT_KEY = "escape_usage";
const OWNER_KEY = "escape_owner";

export function useUsageLimit() {
  const isOwner = localStorage.getItem(OWNER_KEY) === "true";

  const [usageCount, setUsageCount] = useState(() => {
    if (isOwner) return 0;
    return parseInt(localStorage.getItem(COUNT_KEY) ?? "0", 10);
  });

  const limitReached = !isOwner && usageCount >= LIMIT;

  const incrementUsage = useCallback(() => {
    if (isOwner) return;
    setUsageCount((prev) => {
      const next = prev + 1;
      localStorage.setItem(COUNT_KEY, String(next));
      return next;
    });
  }, [isOwner]);

  return { limitReached, usageCount, incrementUsage };
}
