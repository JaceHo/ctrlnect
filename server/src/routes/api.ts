import { Hono } from "hono";
import type { SessionStore } from "../session-store.js";
import type { AgentRunner } from "../agent-runner.js";
import type { ConnectionManager } from "../connection-manager.js";
import type { CreateSessionRequest, UpdateSessionRequest } from "@webclaude/shared";
import { AVAILABLE_MODELS } from "@webclaude/shared";

export function createApiRoutes(
  sessionStore: SessionStore,
  agentRunner: AgentRunner,
  connectionManager: ConnectionManager,
) {
  const api = new Hono();

  // List all sessions
  api.get("/sessions", (c) => {
    return c.json(sessionStore.getAll());
  });

  // Create a new session
  api.post("/sessions", async (c) => {
    const body = (await c.req.json()) as CreateSessionRequest;
    const session = sessionStore.create(body);
    connectionManager.broadcastAll({
      type: "session_update",
      session,
    });
    return c.json(session, 201);
  });

  // Get a single session
  api.get("/sessions/:id", (c) => {
    const session = sessionStore.get(c.req.param("id"));
    if (!session) return c.json({ error: "Not found" }, 404);
    return c.json(session);
  });

  // Update a session
  api.patch("/sessions/:id", async (c) => {
    const body = (await c.req.json()) as UpdateSessionRequest;
    const session = sessionStore.update(c.req.param("id"), body);
    if (!session) return c.json({ error: "Not found" }, 404);
    connectionManager.broadcastAll({
      type: "session_update",
      session,
    });
    return c.json(session);
  });

  // Delete a session
  api.delete("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    // Kill running agent if any
    if (agentRunner.isRunning(id)) {
      await agentRunner.interrupt(id);
    }
    const deleted = sessionStore.delete(id);
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  // List available models
  api.get("/models", (c) => {
    return c.json(AVAILABLE_MODELS);
  });

  return api;
}
