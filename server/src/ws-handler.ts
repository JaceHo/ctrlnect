import type { ServerWebSocket } from "bun";
import type { ClientMessage, ContentBlock, PersistedMessage } from "@ctrlnect/shared";
import type { ConnectionManager, WSData } from "./connection-manager.js";
import type { AgentRunner } from "./agent-runner.js";
import type { SessionStore } from "./session-store.js";
import type { MessageStore } from "./message-store.js";
import type { FeishuBridge } from "./feishu/feishu-bridge.js";
import { extractAssistantText } from "./agent-event-utils.js";

export class WSHandler {
  constructor(
    private connectionManager: ConnectionManager,
    private agentRunner: AgentRunner,
    private sessionStore: SessionStore,
    private messageStore: MessageStore,
    /** Optional – when present, manually-typed ctrlnect replies for Feishu DM
     *  sessions are also forwarded back to Feishu after Claude finishes. */
    private feishuBridge: FeishuBridge | null = null,
  ) {}

  onOpen(ws: ServerWebSocket<WSData>) {
    console.log("[WS] Client connected");
    this.connectionManager.add(ws);
  }

  onClose(ws: ServerWebSocket<WSData>) {
    this.connectionManager.remove(ws);
  }

  onMessage(ws: ServerWebSocket<WSData>, raw: string | Buffer) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", sessionId: "", message: "Invalid JSON" }));
      return;
    }

    console.log(`[WS] Received: ${msg.type}`, msg.type === "chat" ? `session=${msg.sessionId} text="${msg.text.slice(0,50)}"` : "");

    switch (msg.type) {
      case "subscribe":
        this.connectionManager.subscribe(ws, msg.sessionId);
        break;

      case "unsubscribe":
        this.connectionManager.unsubscribe(ws, msg.sessionId);
        break;

      case "interrupt":
        this.handleInterrupt(msg.sessionId);
        break;

      case "chat":
        this.handleChat(msg.sessionId, msg.text, msg.images);
        break;

      case "cron_trigger":
        if (this.cronTriggerHandler) {
          this.cronTriggerHandler(msg.cronId);
        }
        break;
    }
  }

  /** Set external handler for cron_trigger messages. */
  setCronTriggerHandler(handler: (cronId: string) => void) {
    this.cronTriggerHandler = handler;
  }

  private cronTriggerHandler: ((cronId: string) => void) | null = null;

  private async handleInterrupt(sessionId: string) {
    await this.agentRunner.interrupt(sessionId);
    this.sessionStore.updateStatus(sessionId, "idle");
    const session = this.sessionStore.get(sessionId);
    if (session) {
      this.connectionManager.broadcast(sessionId, {
        type: "session_update",
        session,
      });
    }
    this.connectionManager.broadcast(sessionId, {
      type: "stream_end",
      sessionId,
    });
  }

  async handleChat(
    sessionId: string,
    text: string,
    _images?: { base64: string; mediaType: string }[],
  ) {
    const session = this.sessionStore.get(sessionId);
    if (!session) {
      this.connectionManager.broadcast(sessionId, {
        type: "error",
        sessionId,
        message: "Session not found",
      });
      return;
    }

    // Persist user message
    const userMsg: PersistedMessage = {
      id: crypto.randomUUID(),
      role: "user",
      blocks: [{ type: "text", text }],
      parentToolUseId: null,
      timestamp: new Date().toISOString(),
    };
    this.messageStore.append(sessionId, userMsg);

    // Update session status
    this.sessionStore.updateStatus(sessionId, "running");
    this.sessionStore.incrementMessages(sessionId);
    this.connectionManager.broadcast(sessionId, {
      type: "session_update",
      session: this.sessionStore.get(sessionId)!,
    });

    this.connectionManager.broadcast(sessionId, {
      type: "stream_start",
      sessionId,
    });

    // Shell command support: !command
    if (text.startsWith("!")) {
      const cmd = text.slice(1).trim();
      console.log(`[WS] Running shell command: ${cmd}`);

      try {
        const { spawn } = await import("child_process");
        const result = await new Promise<string>((resolve, reject) => {
          const proc = spawn("sh", ["-c", cmd], {
            cwd: session.cwd,
            env: process.env,
          });
          let stdout = "";
          let stderr = "";
          proc.stdout?.on("data", (data) => { stdout += data; });
          proc.stderr?.on("data", (data) => { stderr += data; });
          proc.on("close", (code) => {
            resolve(stdout + (stderr ? `\n[stderr]\n${stderr}` : ""));
          });
          proc.on("error", reject);
          setTimeout(() => {
            proc.kill();
            resolve("[timeout - process killed]");
          }, 30000);
        });

        // Send result as tool_result block for proper chat UI display
        const outputText = result || "(empty output)";
        const toolUseId = crypto.randomUUID();
        const outputMsg: PersistedMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          blocks: [
            { type: "tool_use", id: toolUseId, name: "shell", input: { command: cmd } },
            { type: "tool_result", toolUseId, content: outputText, isError: false },
          ],
          parentToolUseId: null,
          timestamp: new Date().toISOString(),
        };
        this.messageStore.append(sessionId, outputMsg);

        this.connectionManager.broadcast(sessionId, {
          type: "agent_event",
          sessionId,
          event: {
            type: "assistant",
            uuid: outputMsg.id,
            message: {
              content: [
                { type: "tool_use", id: toolUseId, name: "shell", input: { command: cmd } },
                { type: "tool_result", tool_use_id: toolUseId, content: outputText, is_error: false },
              ],
            },
          },
        });

        // End stream
        this.connectionManager.broadcast(sessionId, {
          type: "stream_end",
          sessionId,
        });
        this.sessionStore.updateStatus(sessionId, "idle");
        return;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.connectionManager.broadcast(sessionId, {
          type: "error",
          sessionId,
          message: `Command failed: ${errMsg}`,
        });
      }
    }

    // If this is a Feishu DM session we collect assistant text to forward back.
    const isFeishu = this.feishuBridge?.isFeishuSession(sessionId) ?? false;
    const feishuReplyParts: string[] = [];

    await this.agentRunner.run(sessionId, text, {
      model: session.model,
      cwd: session.cwd,
      onEvent: (event) => {
        this.connectionManager.broadcast(sessionId, {
          type: "agent_event",
          sessionId,
          event,
        });

        // Persist assistant and tool-result messages from final "assistant" events
        this.persistAgentEvent(sessionId, event);

        // Collect text blocks for Feishu forwarding
        if (isFeishu) {
          const e = event as Record<string, unknown>;
          if (e.type === "assistant") {
            const msg = e.message as
              | { content?: Array<Record<string, unknown>> }
              | undefined;
            for (const block of msg?.content ?? []) {
              if (block.type === "text" && typeof block.text === "string") {
                feishuReplyParts.push(block.text as string);
              }
            }
          }
        }
      },
      onEnd: async (cost) => {
        if (cost) {
          this.sessionStore.addCost(sessionId, cost.totalCost);
        }
        this.sessionStore.updateStatus(sessionId, "idle");
        const updated = this.sessionStore.get(sessionId);
        if (updated) {
          this.connectionManager.broadcast(sessionId, {
            type: "session_update",
            session: updated,
          });
        }
        this.connectionManager.broadcast(sessionId, {
          type: "stream_end",
          sessionId,
          cost,
        });

        // Forward the reply to Feishu for manually-typed ctrlnect messages
        // Skip if session has placeholder chatId (no real Feishu DM yet)
        const session = this.sessionStore.get(sessionId);
        const hasValidChatId = session?.feishuDmInfo?.chatId && session.feishuDmInfo.chatId !== "placeholder";
        if (isFeishu && this.feishuBridge && hasValidChatId) {
          const replyText = feishuReplyParts.join("").trim();
          if (replyText) {
            await this.feishuBridge.forwardReplyToFeishu(sessionId, replyText);
          }
        }
      },
      onError: (err, willRetry) => {
        if (willRetry) {
          this.connectionManager.broadcast(sessionId, {
            type: "error",
            sessionId,
            message: `${err.message} — retrying...`,
          });
          return;
        }

        // Persist the error as a message so it shows on reload
        const errMsg: PersistedMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          blocks: [{ type: "text", text: `Error: ${err.message}` }],
          parentToolUseId: null,
          timestamp: new Date().toISOString(),
        };
        this.messageStore.append(sessionId, errMsg);

        this.sessionStore.updateStatus(sessionId, "error");
        const errSession = this.sessionStore.get(sessionId);
        if (errSession) {
          this.connectionManager.broadcast(sessionId, {
            type: "session_update",
            session: errSession,
          });
        }
        this.connectionManager.broadcast(sessionId, {
          type: "error",
          sessionId,
          message: err.message,
        });
        this.connectionManager.broadcast(sessionId, {
          type: "stream_end",
          sessionId,
        });

        // Auto-recover to idle after 2s
        setTimeout(() => {
          const current = this.sessionStore.get(sessionId);
          if (current?.status === "error") {
            this.sessionStore.updateStatus(sessionId, "idle");
            const recovered = this.sessionStore.get(sessionId)!;
            this.connectionManager.broadcast(sessionId, {
              type: "session_update",
              session: recovered,
            });
          }
        }, 2000);
      },
    });
  }

  /**
   * Extract and persist messages from SDK agent events.
   * Only saves finalized "assistant" messages (not stream deltas).
   */
  private persistAgentEvent(sessionId: string, event: unknown): void {
    const e = event as Record<string, unknown>;
    if (e.type !== "assistant") return;

    const uuid = (e.uuid as string) || crypto.randomUUID();
    const parentToolUseId = (e.parent_tool_use_id as string | null) ?? null;
    const message = e.message as { content?: Array<Record<string, unknown>> } | undefined;
    const blocks = this.extractBlocks(message?.content);

    if (blocks.length === 0) return;

    const msg: PersistedMessage = {
      id: uuid,
      role: "assistant",
      blocks,
      parentToolUseId,
      timestamp: new Date().toISOString(),
    };
    this.messageStore.append(sessionId, msg);
  }

  private extractBlocks(content: Array<Record<string, unknown>> | undefined): ContentBlock[] {
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
            type: "tool_use",
            id: part.id as string,
            name: part.name as string,
            input: part.input,
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
}
