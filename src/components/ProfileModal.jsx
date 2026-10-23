/**
 * ProfileModal.jsx
 * ================
 * Full profile view displaying:
 * - User stats (current streak, longest streak, total tasks escaped)
 * - Chronological history of past tasks/sessions
 * - Detailed breakdown of completed micro-steps for any session
 */

import { useState, useEffect, useCallback } from "react";
import { getUserSessions, getSessionDetails, deleteSession } from "../lib/api.js";
import styles from "./ProfileModal.module.css";

export default function ProfileModal({ isOpen, onClose, userId, streak }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all"); // "all" | "completed"
  const [expandedId, setExpandedId] = useState(null);
  const [expandedSteps, setExpandedSteps] = useState(null);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch session history when modal opens
  const fetchHistory = useCallback(async () => {
    if (!userId || !isOpen) return;
    setLoading(true);
    try {
      const data = await getUserSessions(userId, {
        completedOnly: filter === "completed",
        limit: 50,
      });
      setSessions(data.sessions || []);
    } catch (e) {
      console.warn("Failed to load user session history", e);
    } finally {
      setLoading(false);
    }
  }, [userId, isOpen, filter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Toggle step details
  const toggleDetails = async (sessionId) => {
    if (expandedId === sessionId) {
      setExpandedId(null);
      setExpandedSteps(null);
      return;
    }
    setExpandedId(sessionId);
    setLoadingSteps(true);
    try {
      const full = await getSessionDetails(sessionId);
      setExpandedSteps(full?.steps_json || []);
    } catch {
      setExpandedSteps([]);
    } finally {
      setLoadingSteps(false);
    }
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this session from your history?")) return;
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (expandedId === sessionId) {
        setExpandedId(null);
        setExpandedSteps(null);
      }
    } catch (err) {
      console.warn("Failed to delete session", err);
    }
  };

  const copyUserId = () => {
    if (!userId) return;
    navigator.clipboard.writeText(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const completedCount = sessions.filter((s) => s.completed_at).length;
  const currentStreak = streak?.current_streak ?? 0;
  const longestStreak = streak?.longest_streak ?? 0;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Your Profile & History</h2>
            <p className={styles.subtitle}>Tracking every moment you escaped inertia</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close profile">
            ×
          </button>
        </div>

        {/* User Identity Pill */}
        <div className={styles.userRow}>
          <div className={styles.userBadge} onClick={copyUserId} title="Click to copy ID">
            <span className={styles.userIcon}>👤</span>
            <span className={styles.userIdText}>
              User #{userId ? userId.slice(0, 8) : "anonymous"}
            </span>
            <span className={styles.copyHint}>{copied ? "Copied!" : "Copy"}</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>🔥</span>
            <span className={styles.statVal}>{currentStreak}</span>
            <span className={styles.statLabel}>Day Streak</span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statIcon}>⭐</span>
            <span className={styles.statVal}>{longestStreak}</span>
            <span className={styles.statLabel}>Best Record</span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statIcon}>✓</span>
            <span className={styles.statVal}>{completedCount}</span>
            <span className={styles.statLabel}>Tasks Escaped</span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statIcon}>⚡</span>
            <span className={styles.statVal}>{sessions.length}</span>
            <span className={styles.statLabel}>Total Sessions</span>
          </div>
        </div>

        {/* Filter Navigation */}
        <div className={styles.navRow}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${filter === "all" ? styles.tabActive : ""}`}
              onClick={() => setFilter("all")}
            >
              All Sessions ({sessions.length})
            </button>
            <button
              className={`${styles.tab} ${filter === "completed" ? styles.tabActive : ""}`}
              onClick={() => setFilter("completed")}
            >
              Finished Tasks ({completedCount})
            </button>
          </div>

          <button className={styles.refreshBtn} onClick={fetchHistory} disabled={loading}>
            {loading ? "refreshing..." : "↻ Refresh"}
          </button>
        </div>

        {/* Sessions List */}
        <div className={styles.listWrap}>
          {loading && sessions.length === 0 ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p>Loading your past tasks...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyIcon}>🌱</p>
              <p className={styles.emptyTitle}>No past tasks found yet</p>
              <p className={styles.emptyText}>
                Once you start and complete tasks, your progress and micro-steps will be logged here.
              </p>
            </div>
          ) : (
            <div className={styles.list}>
              {sessions.map((s) => {
                const isDone = Boolean(s.completed_at);
                const isExpanded = expandedId === s.id;
                const formattedDate = new Date(s.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={s.id}
                    className={`${styles.sessionCard} ${isDone ? styles.cardDone : styles.cardInProgress}`}
                  >
                    <div className={styles.sessionMain}>
                      <div className={styles.sessionTop}>
                        <div className={styles.statusBadge}>
                          <span className={styles.statusDot} />
                          {isDone ? "Completed" : "In Progress"}
                        </div>
                        <div className={styles.sessionRightMeta}>
                          <span className={styles.date}>{formattedDate}</span>
                          <button
                            type="button"
                            className={styles.deleteBtn}
                            onClick={(e) => handleDeleteSession(e, s.id)}
                            title="Delete this session from history"
                            aria-label="Delete session"
                          >
                            🗑
                          </button>
                        </div>
                      </div>

                      <h3 className={styles.goal}>{s.goal}</h3>

                      <div className={styles.metaRow}>
                        {s.energy_level && (
                          <span className={styles.metaPill}>
                            ⚡ Energy {s.energy_level}/10
                          </span>
                        )}
                        {s.low_power_mode && (
                          <span className={styles.metaPill}>
                            🌙 Low-Power
                          </span>
                        )}
                        <span className={styles.metaPill}>
                          Stuck count: {s.stuck_count ?? 0}
                        </span>

                        <button
                          className={styles.expandBtn}
                          onClick={() => toggleDetails(s.id)}
                        >
                          {isExpanded ? "hide steps ↑" : "view steps ↓"}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Step Details */}
                    {isExpanded && (
                      <div className={styles.detailsDrawer}>
                        <h4 className={styles.drawerTitle}>Micro-Steps Blueprint:</h4>
                        {loadingSteps ? (
                          <p className={styles.loadingMini}>Loading steps...</p>
                        ) : !expandedSteps || expandedSteps.length === 0 ? (
                          <p className={styles.noSteps}>No detailed steps saved for this session.</p>
                        ) : (
                          <ol className={styles.stepsList}>
                            {expandedSteps.map((step, idx) => (
                              <li key={step.id ?? idx} className={styles.stepItem}>
                                <span className={styles.stepIdx}>
                                  {String(idx + 1).padStart(2, "0")}
                                </span>
                                <span className={styles.stepText}>{step.text}</span>
                                {step.duration && (
                                  <span className={styles.stepDuration}>
                                    {step.duration}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
