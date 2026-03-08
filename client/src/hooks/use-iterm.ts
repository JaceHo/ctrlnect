import { useState, useEffect, useCallback, useRef } from "react";
import { useWS } from "./use-websocket";

export interface ItermSession {
  session_id: string;
  name: string;
  window_id: string;
  tab_id: string;
  job_name?: string;
  current_title?: string;
  profile_name?: string;
  pwd?: string;
  aiTitle?: string;
}

export interface ItermContent {
  session_id: string;
  content: string;
  lines: number;
  start_line: number;
  newest_line: number;
  following_latest: boolean;
  columns: number;
}

function contentFingerprint(content: string): string {
  const s = content.slice(-800);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return String(h >>> 0);
}

interface TitleCache {
  title: string;
  contentFp: string;
  fetchedAt: number;
}

export function useIterm() {
  const [sessions, setSessions] = useState<ItermSession[]>([]);
  const [available, setAvailable] = useState(true);
  const ws = useWS();
  const lastFetchRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);
  const titleCacheRef = useRef<Map<string, TitleCache>>(new Map());

  // Queue: processes one title at a time
  const titleQueueRef = useRef<{ id: string; name: string; fp?: string }[]>([]);
  const queueRunningRef = useRef(false);

  // Set when server first responds — queue won't start until this is set
  const serverReadyRef = useRef<number>(0);

  const runTitleQueue = useCallback(async () => {
    if (queueRunningRef.current) return;
    // Block until server is confirmed ready
    if (!serverReadyRef.current) return;

    queueRunningRef.current = true;
    while (titleQueueRef.current.length > 0) {
      // Re-check server readiness on each iteration
      if (!serverReadyRef.current) {
        // Server went down — pause queue, don't consume items
        break;
      }

      const item = titleQueueRef.current.shift()!;
      const { id, name, fp } = item;
      const cached = titleCacheRef.current.get(id);

      // Skip if title is already fresh for this content
      if (cached && (!fp || fp === cached.contentFp)) continue;

      let networkError = false;
      try {
        const res = await fetch(
          `/api/iterm/session/${id}/title?name=${encodeURIComponent(name)}`,
          { signal: AbortSignal.timeout(12000) },
        );
        if (res.ok) {
          const data = (await res.json()) as { title: string };
          titleCacheRef.current.set(id, {
            title: data.title,
            contentFp: fp || "",
            fetchedAt: Date.now(),
          });
          setSessions((prev) =>
            prev.map((s) => s.session_id === id ? { ...s, aiTitle: data.title } : s)
          );
        }
        // HTTP error (4xx/5xx) → skip this item, move on
      } catch {
        networkError = true;
      }

      if (networkError) {
        // Server unreachable — put item back at front and wait for server to return
        titleQueueRef.current.unshift(item);
        // Mark server as not ready so we stop processing
        serverReadyRef.current = 0;
        break;
      }

      // 2s gap between successful requests
      if (titleQueueRef.current.length > 0) {
        await new Promise<void>((r) => setTimeout(r, 2000));
      }
    }
    queueRunningRef.current = false;
  }, []);

  const enqueueTitleFetch = useCallback((id: string, name: string, fp?: string) => {
    const cached = titleCacheRef.current.get(id);
    if (cached && (!fp || fp === cached.contentFp)) return;
    if (titleQueueRef.current.some((q) => q.id === id)) return;
    titleQueueRef.current.push({ id, name, fp });
    // Only start queue if server is ready — otherwise it will start
    // automatically when fetchSessions next succeeds
    if (serverReadyRef.current) {
      runTitleQueue();
    }
  }, [runTitleQueue]);

  const fetchSessions = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchRef.current < 2000) return;
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    lastFetchRef.current = now;

    try {
      const res = await fetch("/api/iterm/sessions");
      if (res.ok) {
        const data = (await res.json()) as { sessions?: ItermSession[]; error?: string };
        const newSessions = data.sessions || [];
        const merged = newSessions.map((s) => {
          const cached = titleCacheRef.current.get(s.session_id);
          return cached ? { ...s, aiTitle: cached.title } : s;
        });
        setSessions(merged);
        setAvailable(!data.error);

        // Mark server ready (this gates the title queue)
        const wasReady = !!serverReadyRef.current;
        serverReadyRef.current = Date.now();

        // Enqueue titles for sessions without one
        merged.forEach((s) => {
          if (!s.aiTitle) {
            enqueueTitleFetch(s.session_id, s.job_name || s.name || "");
          }
        });

        // If server just came back up, re-kick the queue
        if (!wasReady && titleQueueRef.current.length > 0) {
          runTitleQueue();
        }
      }
    } catch {
      setAvailable(false);
      serverReadyRef.current = 0; // server is down — queue will pause
    } finally {
      isFetchingRef.current = false;
    }
  }, [enqueueTitleFetch, runTitleQueue]);

  useEffect(() => {
    fetchSessions(true);
    const interval = setInterval(() => fetchSessions(), 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Re-fetch immediately when the WebSocket reconnects (server restart recovery)
  useEffect(() => ws.onConnect(() => fetchSessions(true)), [ws, fetchSessions]);

  const getContent = useCallback(async (
    sessionId: string,
    lines = 200,
    sessionName?: string,
  ): Promise<ItermContent | null> => {
    try {
      const res = await fetch(`/api/iterm/session/${sessionId}/content?lines=${lines}`);
      if (res.ok) {
        const data: ItermContent = await res.json();
        const fp = contentFingerprint(data.content);
        const cached = titleCacheRef.current.get(sessionId);
        if (cached && fp !== cached.contentFp) {
          enqueueTitleFetch(sessionId, sessionName || "", fp);
        }
        return data;
      }
    } catch {}
    return null;
  }, [enqueueTitleFetch]);

  const sendText = useCallback(async (sessionId: string, text: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/iterm/session/${sessionId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return { sessions, available, fetchSessions, getContent, sendText };
}
