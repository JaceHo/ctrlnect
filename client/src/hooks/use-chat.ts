import { useState, useEffect, useCallback, useRef } from "react";
import { useWS, useWSListener } from "./use-websocket";
import type { ServerMessage, CostInfo, ImageData } from "@webclaude/shared";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  blocks: ContentBlock[];
  parentToolUseId: string | null;
  timestamp: string;
}

export function useChat(sessionId: string | null) {
  const ws = useWS();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [lastCost, setLastCost] = useState<CostInfo | undefined>();

  // Use ref so the WS listener always sees the current sessionId
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Subscribe when session changes
  useEffect(() => {
    if (!sessionId) return;
    console.log("[Chat] Subscribing to session", sessionId);
    setMessages([]);
    setStreaming(false);
    setLastCost(undefined);
    ws.send({ type: "subscribe", sessionId });
    return () => {
      ws.send({ type: "unsubscribe", sessionId });
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
          break;

        case "stream_end":
          setStreaming(false);
          if (msg.cost) setLastCost(msg.cost);
          break;

        case "error":
          console.error("[Chat] Error:", msg.message);
          setStreaming(false);
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
          break;

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
    ws.send({ type: "interrupt", sessionId });
  }, [sessionId, ws]);

  return { messages, streaming, lastCost, sendMessage, interrupt };
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
      if (blocks.length === 0) break;
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
      console.log("[Chat] Assistant message, blocks:", blocks.length);
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
      break;
    }

    case "stream_event": {
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
