import { useState, useEffect, useCallback } from "react";
import type { Session, CreateSessionRequest, UpdateSessionRequest } from "@webclaude/shared";
import { useWSListener } from "./use-websocket";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch sessions on mount
  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => {
        setSessions(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    const session: Session = await res.json();
    setSessions((prev) => [session, ...prev]);
    return session;
  }, []);

  const updateSession = useCallback(
    async (id: string, req: UpdateSessionRequest) => {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return (await res.json()) as Session;
    },
    [],
  );

  const deleteSession = useCallback(async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { sessions, loading, createSession, updateSession, deleteSession };
}
