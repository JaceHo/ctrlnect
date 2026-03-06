import { Hono } from "hono";
import type { SessionStore } from "../session-store.js";
import type { AgentRunner } from "../agent-runner.js";
import type { ConnectionManager } from "../connection-manager.js";
import type { MessageStore } from "../message-store.js";
import type { FeishuBridge } from "../feishu/feishu-bridge.js";
import type { CreateSessionRequest, UpdateSessionRequest, CreateCronRequest, UpdateCronRequest } from "@webclaude/shared";
import { AVAILABLE_MODELS } from "@webclaude/shared";
import type { CronStore } from "../cron-store.js";
import type { CronScheduler } from "../cron-scheduler.js";
import type { ServiceStore } from "../service-store.js";
import { detectApiProvider, setPreferredProvider, type ApiProvider } from "../agent-runner.js";

export function createApiRoutes(
  sessionStore: SessionStore,
  agentRunner: AgentRunner,
  connectionManager: ConnectionManager,
  messageStore: MessageStore,
  feishuBridge: FeishuBridge | null = null,
  cronStore: CronStore | null = null,
  cronScheduler: CronScheduler | null = null,
  serviceStore: ServiceStore | null = null,
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

  // Get messages for a session
  api.get("/sessions/:id/messages", (c) => {
    const id = c.req.param("id");
    const session = sessionStore.get(id);
    if (!session) return c.json({ error: "Not found" }, 404);
    return c.json(messageStore.getAll(id));
  });

  // Delete a session
  api.delete("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    // Kill running agent if any
    if (agentRunner.isRunning(id)) {
      await agentRunner.interrupt(id);
    }
    messageStore.delete(id);
    const deleted = sessionStore.delete(id);
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  // List available models
  api.get("/models", (c) => {
    return c.json(AVAILABLE_MODELS);
  });

  // ── Feishu integration routes ───────────────────────────────────────────────

  /** GET /api/feishu/status – returns bridge status or disabled notice. */
  api.get("/feishu/status", (c) => {
    if (!feishuBridge) {
      return c.json({
        enabled: false,
        message:
          'Feishu integration disabled. Set enabled=true in ~/.openclaw/config.json',
      });
    }
    return c.json(feishuBridge.getStatus());
  });

  /** POST /api/feishu/send – manually send a message to a Feishu DM session.
   *  Body: { sessionId: string, text: string }
   */
  api.post("/feishu/send", async (c) => {
    if (!feishuBridge) {
      return c.json({ error: "Feishu integration not enabled" }, 503);
    }
    const { sessionId, text } = (await c.req.json()) as {
      sessionId: string;
      text: string;
    };
    if (!sessionId || !text) {
      return c.json({ error: "sessionId and text are required" }, 400);
    }
    if (!feishuBridge.isFeishuSession(sessionId)) {
      return c.json({ error: "Not a Feishu session" }, 404);
    }
    await feishuBridge.forwardReplyToFeishu(sessionId, text);
    return c.json({ ok: true });
  });

  // ── Cron job routes ──────────────────────────────────────────────────────────

  api.get("/crons", (c) => {
    if (!cronStore) return c.json([]);
    return c.json(cronStore.getAll());
  });

  api.post("/crons", async (c) => {
    if (!cronStore || !cronScheduler) return c.json({ error: "Crons not available" }, 503);
    const body = (await c.req.json()) as CreateCronRequest;
    if (!body.sessionId || !body.name || !body.schedule || !body.prompt) {
      return c.json({ error: "sessionId, name, schedule, and prompt are required" }, 400);
    }
    const cron = cronStore.create(body);
    cronScheduler.refreshNextRun(cron.id);
    connectionManager.broadcastAll({ type: "cron_update", cron: cronStore.get(cron.id)! });
    return c.json(cron, 201);
  });

  api.patch("/crons/:id", async (c) => {
    if (!cronStore || !cronScheduler) return c.json({ error: "Crons not available" }, 503);
    const body = (await c.req.json()) as UpdateCronRequest;
    const cron = cronStore.update(c.req.param("id"), body);
    if (!cron) return c.json({ error: "Not found" }, 404);
    // Refresh nextRun if schedule or enabled changed
    if (body.schedule !== undefined || body.enabled !== undefined) {
      cronScheduler.refreshNextRun(cron.id);
    }
    connectionManager.broadcastAll({ type: "cron_update", cron: cronStore.get(cron.id)! });
    return c.json(cronStore.get(cron.id));
  });

  api.delete("/crons/:id", (c) => {
    if (!cronStore) return c.json({ error: "Crons not available" }, 503);
    const deleted = cronStore.delete(c.req.param("id"));
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  api.get("/crons/:id/logs", (c) => {
    if (!cronStore) return c.json([]);
    const cron = cronStore.get(c.req.param("id"));
    if (!cron) return c.json({ error: "Not found" }, 404);
    const logs = cronStore.getLogs(cron.id);
    // Return newest first
    return c.json(logs.reverse());
  });

  api.post("/crons/:id/trigger", async (c) => {
    if (!cronScheduler) return c.json({ error: "Crons not available" }, 503);
    const cron = cronStore?.get(c.req.param("id"));
    if (!cron) return c.json({ error: "Not found" }, 404);
    cronScheduler.trigger(cron.id);
    return c.json({ ok: true });
  });

  // ── Service management routes ─────────────────────────────────────────────────

  api.get("/services", (c) => {
    if (!serviceStore) return c.json([]);
    return c.json(serviceStore.getAll());
  });

  api.post("/services", async (c) => {
    if (!serviceStore) return c.json({ error: "Service store not available" }, 503);
    const body = (await c.req.json()) as {
      name: string;
      description?: string;
      command: string;
      cwd?: string;
      logPath?: string;
    };
    if (!body.name || !body.command) {
      return c.json({ error: "name and command are required" }, 400);
    }
    const service = serviceStore.create(body);
    return c.json(service, 201);
  });

  api.get("/services/discover", async (c) => {
    if (!serviceStore) return c.json({ error: "Service store not available" }, 503);
    const discovered = await serviceStore.discoverServices();
    return c.json(discovered);
  });

  api.post("/services/:id/start", async (c) => {
    if (!serviceStore) return c.json({ error: "Service store not available" }, 503);
    const service = serviceStore.get(c.req.param("id"));
    if (!service) return c.json({ error: "Not found" }, 404);
    const ok = await serviceStore.startService(c.req.param("id"));
    return c.json({ ok, service: serviceStore.get(c.req.param("id")) });
  });

  api.post("/services/:id/stop", (c) => {
    if (!serviceStore) return c.json({ error: "Service store not available" }, 503);
    const service = serviceStore.get(c.req.param("id"));
    if (!service) return c.json({ error: "Not found" }, 404);
    const ok = serviceStore.stopService(c.req.param("id"));
    return c.json({ ok, service: serviceStore.get(c.req.param("id")) });
  });

  api.post("/services/:id/restart", async (c) => {
    if (!serviceStore) return c.json({ error: "Service store not available" }, 503);
    const service = serviceStore.get(c.req.param("id"));
    if (!service) return c.json({ error: "Not found" }, 404);
    const ok = await serviceStore.restartService(c.req.param("id"));
    return c.json({ ok, service: serviceStore.get(c.req.param("id")) });
  });

  api.get("/services/:id/logs", (c) => {
    if (!serviceStore) return c.json({ error: "Service store not available" }, 503);
    const service = serviceStore.get(c.req.param("id"));
    if (!service) return c.json({ error: "Not found" }, 404);
    const lines = parseInt(c.req.query("lines") || "100");
    const logs = serviceStore.getServiceLogs(c.req.param("id"), lines);
    return c.text(logs);
  });

  api.delete("/services/:id", (c) => {
    if (!serviceStore) return c.json({ error: "Service store not available" }, 503);
    const deleted = serviceStore.delete(c.req.param("id"));
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  // ── API config routes ──────────────────────────────────────────────────────

  api.get("/config", (c) => {
    const info = detectApiProvider();
    return c.json(info);
  });

  api.post("/config", async (c) => {
    const { provider } = (await c.req.json()) as { provider: ApiProvider };
    if (provider !== "anthropic" && provider !== "openai") {
      return c.json({ error: "provider must be 'anthropic' or 'openai'" }, 400);
    }
    setPreferredProvider(provider);
    return c.json(detectApiProvider());
  });

  return api;
}
