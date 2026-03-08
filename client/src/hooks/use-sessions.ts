import { useState, useEffect, useCallback } from "react";
import type { Session, CreateSessionRequest, UpdateSessionRequest } from "@webclaude/shared";
import { useWS, useWSListener } from "./use-websocket";
import { API_BASE } from "../api";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const ws = useWS();

  const fetchSessions = useCallback(() => {
    fetch(`${API_BASE}/api/sessions`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Fetch on mount
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Re-fetch whenever the WebSocket reconnects (server restart recovery)
  useEffect(() => ws.onConnect(fetchSessions), [ws, fetchSessions]);

  // Listen for session updates via WebSocket
  useWSListener(
    useCallback((msg) => {
      if (msg.type === "session_update") {
        setSessions((prev) => {
          const idx = prev.findIndex((s) => s.id === msg.session.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = msg.session;
            return next;
          }
          return [msg.session, ...prev];
        });
      }
    }, []),
  );

  const createSession = useCallback(async (req: CreateSessionRequest) => {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    const session: Session = await res.json();
    return session;
  }, []);

  const updateSession = useCallback(
    async (id: string, req: UpdateSessionRequest) => {
      const res = await fetch(`${API_BASE}/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return (await res.json()) as Session;
    },
    [],
  );

  const deleteSession = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/api/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { sessions, loading, createSession, updateSession, deleteSession };
}
