// --- Message persistence types ---

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean; toolName?: string }
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

/** Metadata attached to sessions that mirror a Feishu DM conversation. */
export interface FeishuDmInfo {
  /** Feishu IM chat_id for the P2P conversation (e.g. "oc_xxx"). */
  chatId: string;
  /** Feishu open_id of the other party (e.g. "ou_xxx"). */
  openId?: string;
  /** Human-readable display name of the Feishu contact. */
  displayName: string;
  /** message_id of the last Feishu message we processed (for dedup). */
  lastFeishuMessageId?: string;
  /** When true, Claude auto-replies to incoming Feishu messages. */
  autoReply: boolean;
}

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
  /** Present only on sessions that mirror a Feishu DM conversation. */
  feishuDmInfo?: FeishuDmInfo;
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

// --- Cron job types ---

export interface CronJob {
  id: string;
  /** "prompt" = AI prompt executed via Claude; "command" = shell command synced to system crontab */
  type: "prompt" | "command";
  sessionId: string;  // only meaningful for type="prompt"
  name: string;
  schedule: string;
  prompt: string;     // AI prompt for type="prompt"; shell command for type="command"
  enabled: boolean;
  status: "idle" | "running" | "error";
  lastRun: string | null;
  nextRun: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface CronRunLog {
  id: string;
  cronId: string;
  status: "success" | "error" | "running";
  startedAt: string;
  endedAt: string | null;
  error: string | null;
  output: string | null;  // stdout/stderr for command type
  trigger: "schedule" | "manual";
}

export interface CreateCronRequest {
  type?: "prompt" | "command";
  sessionId?: string;   // required when type="prompt"
  name: string;
  schedule: string;
  prompt: string;
  enabled?: boolean;
}

export interface UpdateCronRequest {
  type?: "prompt" | "command";
  sessionId?: string;
  name?: string;
  schedule?: string;
  prompt?: string;
  enabled?: boolean;
}

// WebSocket protocol - Client to Server
export type ClientMessage =
  | { type: "chat"; sessionId: string; text: string; images?: ImageData[] }
  | { type: "interrupt"; sessionId: string }
  | { type: "subscribe"; sessionId: string }
  | { type: "unsubscribe"; sessionId: string }
  | { type: "cron_trigger"; cronId: string };

// WebSocket protocol - Server to Client
export type ServerMessage =
  | { type: "agent_event"; sessionId: string; event: unknown }
  | { type: "session_update"; session: Session }
  | { type: "stream_start"; sessionId: string }
  | { type: "stream_end"; sessionId: string; cost?: CostInfo }
  | { type: "error"; sessionId: string; message: string }
  | { type: "cron_update"; cron: CronJob }
  | { type: "cron_list"; crons: CronJob[] };

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
