import type { ServerWebSocket } from "bun";
import type { ClientMessage } from "@webclaude/shared";
import type { ConnectionManager, WSData } from "./connection-manager.js";
import type { AgentRunner } from "./agent-runner.js";
import type { SessionStore } from "./session-store.js";

export class WSHandler {
  constructor(
    private connectionManager: ConnectionManager,
    private agentRunner: AgentRunner,
    private sessionStore: SessionStore,
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
    }
  }

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

  private async handleChat(
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

    await this.agentRunner.run(sessionId, text, {
      model: session.model,
      cwd: session.cwd,
      onEvent: (event) => {
        this.connectionManager.broadcast(sessionId, {
          type: "agent_event",
          sessionId,
          event,
        });
      },
      onEnd: (cost) => {
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
      },
      onError: (err, willRetry) => {
        if (willRetry) {
          // Transient failure — notify client but stay "running" for retry
          this.connectionManager.broadcast(sessionId, {
            type: "error",
            sessionId,
            message: `${err.message} — retrying...`,
          });
          return;
        }

        // Final failure — set error then auto-recover to idle
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

        // Auto-recover to idle after 2s so new queries can be sent
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
}
