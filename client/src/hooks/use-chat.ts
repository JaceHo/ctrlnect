import { useState, useEffect, useCallback, useRef } from "react";
import { useWS, useWSListener } from "./use-websocket";
import type { ServerMessage, CostInfo, ImageData, ContentBlock, PersistedMessage } from "@webclaude/shared";
import { API_BASE } from "../api";

export type { ContentBlock } from "@webclaude/shared";

export type ChatMessage = PersistedMessage;

// Sub-task status for multi-task management
export type SubTaskStatus = "pending" | "running" | "completed" | "failed" | "interrupted";

export interface SubTask {
  id: string;
  name: string;
  status: SubTaskStatus;
  input: string;
  result?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

// --- Typewriter animation for non-streaming responses ---
// Characters revealed per animation frame (~16ms)
const CHARS_PER_FRAME = 12;

interface TypewriterJob {
  uuid: string;
  fullBlocks: ContentBlock[];
  revealedChars: number;
  totalChars: number;
  parentToolUseId: string | null;
}

let typewriterJobs: TypewriterJob[] = [];
let typewriterRafId: number | null = null;
let typewriterSetMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> | null = null;
/** Track whether we received any stream_event (real streaming) */
let gotStreamEvents = false;

function startTypewriterLoop() {
  if (typewriterRafId !== null) return;
  const tick = () => {
    if (typewriterJobs.length === 0 || !typewriterSetMessages) {
      typewriterRafId = null;
      return;
    }
    const setMsg = typewriterSetMessages;
    const done: string[] = [];

    for (const job of typewriterJobs) {
      job.revealedChars = Math.min(job.revealedChars + CHARS_PER_FRAME, job.totalChars);
      const partialBlocks = sliceBlocks(job.fullBlocks, job.revealedChars);

      setMsg((prev) => {
        const idx = prev.findIndex((m) => m.id === job.uuid && m.role === "assistant");
        const msg: ChatMessage = {
          id: job.uuid,
          role: "assistant",
          blocks: partialBlocks,
          parentToolUseId: job.parentToolUseId,
          timestamp: new Date().toISOString(),
        };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = msg;
          return next;
        }
        return [...prev, msg];
      });

      if (job.revealedChars >= job.totalChars) {
        done.push(job.uuid);
      }
    }

    typewriterJobs = typewriterJobs.filter((j) => !done.includes(j.uuid));
    typewriterRafId = requestAnimationFrame(tick);
  };
  typewriterRafId = requestAnimationFrame(tick);
}

function cancelTypewriter() {
  typewriterJobs = [];
  if (typewriterRafId !== null) {
    cancelAnimationFrame(typewriterRafId);
    typewriterRafId = null;
  }
}

/** Count total text characters across text/thinking blocks */
function countTextChars(blocks: ContentBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type === "text" || b.type === "thinking") n += b.text.length;
  }
  return n;
}

/** Slice blocks to reveal only the first `chars` characters of text/thinking content */
function sliceBlocks(blocks: ContentBlock[], chars: number): ContentBlock[] {
  const result: ContentBlock[] = [];
  let remaining = chars;
  for (const b of blocks) {
    if (b.type === "text" || b.type === "thinking") {
      if (remaining <= 0) break;
      const sliced = b.text.slice(0, remaining);
      remaining -= sliced.length;
      result.push({ ...b, text: sliced });
    } else {
      // tool_use, tool_result, image — include as-is
      result.push(b);
    }
  }
  return result;
}

export function useChat(sessionId: string | null) {
  const ws = useWS();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [lastCost, setLastCost] = useState<CostInfo | undefined>();
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);

  // Use ref so the WS listener always sees the current sessionId
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Keep setMessages available for typewriter
  typewriterSetMessages = setMessages;

  // Listen for sub-task creation and completion events from message processing
  useEffect(() => {
    const handleSubTaskCreated = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; name: string; input: string }>).detail;
      setSubTasks((prev) => [...prev, {
        id: detail.id,
        name: detail.name,
        status: "running",
        input: detail.input,
        startedAt: new Date().toISOString(),
      }]);
    };

    const handleSubTaskCompleted = (e: Event) => {
      const detail = (e as CustomEvent<{ toolUseId: string; content: string; isError?: boolean }>).detail;
      setSubTasks((prev) => prev.map((t) =>
        t.id === detail.toolUseId
          ? {
              ...t,
              status: detail.isError ? "failed" as const : "completed" as const,
              result: detail.content,
              completedAt: new Date().toISOString(),
              error: detail.isError ? detail.content : undefined,
            }
          : t
      ));
    };

    window.addEventListener("subtask-created", handleSubTaskCreated);
    window.addEventListener("subtask-completed", handleSubTaskCompleted);
    return () => {
      window.removeEventListener("subtask-created", handleSubTaskCreated);
      window.removeEventListener("subtask-completed", handleSubTaskCompleted);
    };
  }, []);

  // Subscribe when session changes + load history
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    console.log("[Chat] Subscribing to session", sessionId);

    // Subscribe to WS first
    ws.send({ type: "subscribe", sessionId });

    // Reset state
    setStreaming(false);
    setLastCost(undefined);
    gotStreamEvents = false;
    cancelTypewriter();

    // Load persisted message history - but don't clear messages until we have data
    fetch(`${API_BASE}/api/sessions/${sessionId}/messages`)
      .then((r) => {
        console.log("[Chat] History response status:", r.status);
        return r.ok ? r.json() : [];
      })
      .then((history: ChatMessage[]) => {
        console.log("[Chat] Loaded", history.length, "messages from history, session:", sessionId);
        if (cancelled) return;
        // Set messages (clear old, use history)
        setMessages(history);
      })
      .catch((err) => console.error("[Chat] Failed to load history:", err));

    return () => {
      cancelled = true;
      ws.send({ type: "unsubscribe", sessionId });
      cancelTypewriter();
    };
  }, [sessionId, ws]);

  // Single listener for all WS messages
  useWSListener(
    useCallback((msg: ServerMessage) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      if ("sessionId" in msg && msg.sessionId !== sid) return;

      switch (msg.type) {
        case "stream_start":
          setStreaming(true);
          gotStreamEvents = false;
          break;

        case "stream_end":
          setStreaming(false);
          if (msg.cost) setLastCost(msg.cost);
          break;

        case "error": {
          const isRetrying = msg.message.endsWith("— retrying...");
          console.error("[Chat] Error:", msg.message);
          // Keep streaming active during retry so the input stays disabled
          if (!isRetrying) {
            setStreaming(false);
            cancelTypewriter();
          }
          // Transient retry errors should not be added to the permanent
          // message history — they'll be followed by the real response.
          if (!isRetrying) {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                blocks: [{ type: "text", text: `Error: ${msg.message}` }],
                parentToolUseId: null,
                timestamp: new Date().toISOString(),
              },
            ]);
          }
          break;
        }

        case "agent_event":
          processAgentEvent(msg.event, setMessages);
          break;
      }
    }, []),
  );

  const sendMessage = useCallback(
    (text: string, images?: ImageData[]) => {
      if (!sessionId || !text.trim()) return;
      console.log("[Chat] Sending message to", sessionId, ":", text.slice(0, 50));

      // Optimistic user message
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          blocks: [{ type: "text", text }],
          parentToolUseId: null,
          timestamp: new Date().toISOString(),
        },
      ]);

      ws.send({ type: "chat", sessionId, text, images });
    },
    [sessionId, ws],
  );

  const interrupt = useCallback(() => {
    if (!sessionId) return;
    cancelTypewriter();
    ws.send({ type: "interrupt", sessionId });
  }, [sessionId, ws]);

  // Sub-task management
  const addSubTask = useCallback((input: string) => {
    const task: SubTask = {
      id: crypto.randomUUID(),
      name: `Task ${subTasks.length + 1}`,
      status: "pending",
      input,
    };
    setSubTasks((prev) => [...prev, task]);
  }, [subTasks.length]);

  const interruptSubTask = useCallback((taskId: string) => {
    setSubTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: "interrupted" as SubTaskStatus } : t
      )
    );
    // Also interrupt the main session
    if (sessionId) {
      ws.send({ type: "interrupt", sessionId });
    }
  }, [sessionId, ws]);

  const retrySubTask = useCallback((taskId: string) => {
    const task = subTasks.find((t) => t.id === taskId);
    if (task) {
      setSubTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "pending" as SubTaskStatus, error: undefined } : t
        )
      );
      // Send the task input as a new message
      if (sessionId) {
        ws.send({ type: "chat", sessionId, text: task.input });
      }
    }
  }, [subTasks, sessionId, ws]);

  const reloadMessages = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages`);
      if (r.ok) setMessages(await r.json());
    } catch { /* ignore */ }
  }, [sessionId]);

  return {
    messages,
    streaming,
    lastCost,
    sendMessage,
    interrupt,
    subTasks,
    addSubTask,
    interruptSubTask,
    retrySubTask,
    reloadMessages,
  };
}

// --- Pure functions below, no hooks ---

function processAgentEvent(
  event: unknown,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
) {
  const e = event as Record<string, unknown>;
  console.log("[Chat] Agent event:", e.type);

  switch (e.type) {
    case "user": {
      const uuid = (e.uuid as string) || crypto.randomUUID();
      const message = e.message as { content: unknown } | undefined;
      const blocks = extractUserBlocks(message?.content);
      // Skip empty blocks and internal SDK system-prompt marker messages
      if (blocks.length === 0) break;
      if (blocks.length === 1 && blocks[0].type === "text" && blocks[0].text === "[system message]") break;
      setMessages((prev) => {
        if (prev.some((m) => m.id === uuid)) return prev;
        return [...prev, {
          id: uuid, role: "user", blocks, parentToolUseId: null,
          timestamp: new Date().toISOString(),
        }];
      });
      break;
    }

    case "assistant": {
      const uuid = (e.uuid as string) || crypto.randomUUID();
      const message = e.message as { content: Array<Record<string, unknown>> } | undefined;
      const parentToolUseId = (e.parent_tool_use_id as string | null) ?? null;
      const blocks = extractAssistantBlocks(message?.content);

      // Track Agent tool (sub-task) creation and completion
      for (const block of blocks) {
        if (block.type === "tool_use" && block.name === "Agent") {
          const input = block.input as { prompt?: string; agentId?: string } | undefined;
          const taskInput = input?.prompt || input?.agentId || "Sub-task";
          // Dispatch sub-task creation (will be handled by component)
          window.dispatchEvent(new CustomEvent("subtask-created", {
            detail: { id: block.id, name: taskInput.slice(0, 40), input: taskInput }
          }));
        }
        // Track sub-task completion (tool_result for Agent tool)
        if (block.type === "tool_result") {
          window.dispatchEvent(new CustomEvent("subtask-completed", {
            detail: { toolUseId: block.toolUseId, content: block.content, isError: block.isError }
          }));
        }
      }

      console.log("[Chat] Assistant message, blocks:", blocks.length, "gotStreamEvents:", gotStreamEvents);

      if (gotStreamEvents) {
        // Real streaming mode — update message in place (stream deltas already handled)
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === uuid);
          const msg: ChatMessage = {
            id: uuid, role: "assistant", blocks, parentToolUseId,
            timestamp: new Date().toISOString(),
          };
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = msg;
            return next;
          }
          return [...prev, msg];
        });
      } else {
        // Non-streaming fallback — use typewriter animation
        const totalChars = countTextChars(blocks);
        if (totalChars > 0) {
          // Remove any existing job for this uuid
          typewriterJobs = typewriterJobs.filter((j) => j.uuid !== uuid);
          typewriterJobs.push({
            uuid,
            fullBlocks: blocks,
            revealedChars: 0,
            totalChars,
            parentToolUseId,
          });
          startTypewriterLoop();
        } else {
          // No text to animate (only tool_use blocks), render immediately
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === uuid);
            const msg: ChatMessage = {
              id: uuid, role: "assistant", blocks, parentToolUseId,
              timestamp: new Date().toISOString(),
            };
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = msg;
              return next;
            }
            return [...prev, msg];
          });
        }
      }
      break;
    }

    case "stream_event": {
      gotStreamEvents = true;
      const uuid = (e.uuid as string) || "";
      const parentToolUseId = (e.parent_tool_use_id as string | null) ?? null;
      const streamEvt = e.event as Record<string, unknown> | undefined;
      if (!streamEvt || !uuid) break;
      processStreamDelta(uuid, parentToolUseId, streamEvt, setMessages);
      break;
    }

    // result, system, etc. - no rendering needed
  }
}

function extractUserBlocks(content: unknown): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (typeof content === "string") {
    blocks.push({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const p of content) {
      if (p.type === "text") blocks.push({ type: "text", text: p.text });
      else if (p.type === "image") blocks.push({ type: "image", source: p.source });
    }
  }
  return blocks;
}

function extractAssistantBlocks(content: Array<Record<string, unknown>> | undefined): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const part of content || []) {
    switch (part.type) {
      case "text":
        blocks.push({ type: "text", text: part.text as string });
        break;
      case "thinking":
        blocks.push({ type: "thinking", text: part.thinking as string });
        break;
      case "tool_use":
        blocks.push({
          type: "tool_use", id: part.id as string,
          name: part.name as string, input: part.input,
        });
        break;
      case "tool_result":
        blocks.push({
          type: "tool_result",
          toolUseId: part.tool_use_id as string,
          content: typeof part.content === "string" ? part.content : JSON.stringify(part.content),
          isError: (part.is_error as boolean) || false,
        });
        break;
    }
  }
  return blocks;
}

function processStreamDelta(
  uuid: string,
  parentToolUseId: string | null,
  ev: Record<string, unknown>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
) {
  if (ev.type === "content_block_delta") {
    const delta = ev.delta as Record<string, unknown> | undefined;
    if (!delta) return;

    if (delta.type === "text_delta") {
      const text = (delta.text as string) || "";
      appendToAssistant(uuid, parentToolUseId, "text", text, setMessages);
    } else if (delta.type === "thinking_delta") {
      const text = (delta.thinking as string) || "";
      appendToAssistant(uuid, parentToolUseId, "thinking", text, setMessages);
    }
  } else if (ev.type === "content_block_start") {
    const cb = ev.content_block as Record<string, unknown> | undefined;
    if (cb?.type === "tool_use") {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === uuid && m.role === "assistant");
        const block: ContentBlock = {
          type: "tool_use", id: cb.id as string,
          name: cb.name as string, input: {},
        };
        if (idx < 0) {
          return [...prev, {
            id: uuid, role: "assistant" as const, blocks: [block],
            parentToolUseId, timestamp: new Date().toISOString(),
          }];
        }
        const next = [...prev];
        next[idx] = { ...next[idx], blocks: [...next[idx].blocks, block] };
        return next;
      });
    }
  }
}

function appendToAssistant(
  uuid: string,
  parentToolUseId: string | null,
  blockType: "text" | "thinking",
  appendText: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
) {
  if (!appendText) return;

  setMessages((prev) => {
    const idx = prev.findIndex((m) => m.id === uuid && m.role === "assistant");

    if (idx < 0) {
      return [...prev, {
        id: uuid, role: "assistant" as const,
        blocks: [{ type: blockType, text: appendText }],
        parentToolUseId, timestamp: new Date().toISOString(),
      }];
    }

    const msg = prev[idx];
    const blocks = [...msg.blocks];
    const last = blocks[blocks.length - 1];

    if (last?.type === blockType) {
      blocks[blocks.length - 1] = { ...last, text: last.text + appendText };
    } else {
      blocks.push({ type: blockType, text: appendText });
    }

    const next = [...prev];
    next[idx] = { ...msg, blocks };
    return next;
  });
}
