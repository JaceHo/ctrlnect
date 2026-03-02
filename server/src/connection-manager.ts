import type { ServerWebSocket } from "bun";
import type { ServerMessage } from "@webclaude/shared";

export interface WSData {
  subscribedSessions: Set<string>;
}

export class ConnectionManager {
  private connections = new Set<ServerWebSocket<WSData>>();

  add(ws: ServerWebSocket<WSData>) {
    this.connections.add(ws);
  }

  remove(ws: ServerWebSocket<WSData>) {
    this.connections.delete(ws);
  }

  subscribe(ws: ServerWebSocket<WSData>, sessionId: string) {
    ws.data.subscribedSessions.add(sessionId);
  }

  unsubscribe(ws: ServerWebSocket<WSData>, sessionId: string) {
    ws.data.subscribedSessions.delete(sessionId);
  }

  broadcast(sessionId: string, message: ServerMessage) {
    const payload = JSON.stringify(message);
    for (const ws of this.connections) {
      if (ws.data.subscribedSessions.has(sessionId)) {
        ws.send(payload);
      }
    }
  }

  broadcastAll(message: ServerMessage) {
    const payload = JSON.stringify(message);
    for (const ws of this.connections) {
      ws.send(payload);
    }
  }
}
