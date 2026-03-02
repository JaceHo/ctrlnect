// --- Message persistence types ---

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface PersistedMessage {
  id: string;
  role: "user" | "assistant";
  blocks: ContentBlock[];
  parentToolUseId: string | null;
  timestamp: string;
}

// --- Session types ---

export type SessionStatus = "idle" | "running" | "error";

export interface Session {
  id: string;
  title: string;
  model: string;
  status: SessionStatus;
  cwd: string;
  createdAt: string;
  lastActivity: string;
  messageCount: number;
  totalCost: number;
}

export interface ImageData {
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
}

export interface CostInfo {
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
}

// WebSocket protocol - Client to Server
export type ClientMessage =
  | { type: "chat"; sessionId: string; text: string; images?: ImageData[] }
  | { type: "interrupt"; sessionId: string }
  | { type: "subscribe"; sessionId: string }
  | { type: "unsubscribe"; sessionId: string };

// WebSocket protocol - Server to Client
export type ServerMessage =
  | { type: "agent_event"; sessionId: string; event: unknown }
  | { type: "session_update"; session: Session }
  | { type: "stream_start"; sessionId: string }
  | { type: "stream_end"; sessionId: string; cost?: CostInfo }
  | { type: "error"; sessionId: string; message: string };

// REST API types
export interface CreateSessionRequest {
  title?: string;
  model?: string;
  cwd?: string;
}

export interface UpdateSessionRequest {
  title?: string;
  model?: string;
}

export const AVAILABLE_MODELS = [
  { id: "claude-sonnet-4-6", name: "Sonnet 4.6", default: true },
  { id: "claude-opus-4-6", name: "Opus 4.6" },
  { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5" },
] as const;
