import type { ClientMessage, ServerMessage } from "@webclaude/shared";

type Listener = (msg: ServerMessage) => void;
type ConnectListener = () => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private connectListeners = new Set<ConnectListener>();
  private pendingMessages: ClientMessage[] = [];
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private alive = true;

  constructor(url?: string) {
    const loc = typeof window !== "undefined" ? window.location : null;
    const protocol = loc?.protocol === "https:" ? "wss:" : "ws:";
    this.url = url || `${protocol}//${loc?.host}/ws`;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.alive = true;
    console.log("[WS] Connecting to", this.url);

    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      console.error("[WS] Failed to create WebSocket:", e);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log("[WS] Connected, flushing", this.pendingMessages.length, "queued messages");
      const toSend = [...this.pendingMessages];
      this.pendingMessages = [];
      for (const msg of toSend) {
        this.ws!.send(JSON.stringify(msg));
      }
      // Notify connect listeners so hooks can re-fetch stale data
      for (const cb of this.connectListeners) cb();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        for (const listener of this.listeners) {
          listener(msg);
        }
      } catch {
        // ignore
      }
    };

    this.ws.onclose = () => {
      console.log("[WS] Disconnected");
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = (e) => {
      console.error("[WS] Error:", e);
    };
  }

  private scheduleReconnect() {
    if (!this.alive) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      console.log("[WS] Reconnecting...");
      this.connect();
    }, 500);
  }

  disconnect() {
    this.alive = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log("[WS] Send:", msg.type);
      this.ws.send(JSON.stringify(msg));
    } else {
      console.log("[WS] Queue (ws not open):", msg.type);
      this.pendingMessages.push(msg);
      // Make sure we're trying to connect
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.connect();
      }
    }
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onConnect(cb: ConnectListener): () => void {
    this.connectListeners.add(cb);
    return () => this.connectListeners.delete(cb);
  }
}
