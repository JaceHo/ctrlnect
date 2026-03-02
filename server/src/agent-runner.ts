import { query, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { CostInfo } from "@webclaude/shared";

interface RunningSession {
  query: Query;
}

interface RunOptions {
  model: string;
  cwd: string;
  onEvent: (event: SDKMessage) => void;
  onEnd: (cost?: CostInfo) => void;
  onError: (err: Error) => void;
}

/**
 * Build a clean env for the SDK subprocess.
 * Picks up ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL from shell config
 * (e.g. ~/.zshrc or ~/.bashrc) via process.env.
 *
 * If ANTHROPIC_API_KEY is not set but ANTHROPIC_AUTH_TOKEN is, use it as
 * the API key (common with third-party proxies that use cr_ tokens).
 *
 * We pass a minimal env to avoid inheriting variables like CLAUDECODE=1
 * or CLAUDE_CODE_ENTRYPOINT that conflict with the SDK subprocess.
 */
function buildSDKEnv(): Record<string, string> {
  const env: Record<string, string> = {
    HOME: process.env.HOME || "",
    PATH: process.env.PATH || "",
    SHELL: process.env.SHELL || "",
    USER: process.env.USER || "",
    LANG: process.env.LANG || "en_US.UTF-8",
    TERM: process.env.TERM || "xterm-256color",
  };

  // API key: prefer ANTHROPIC_API_KEY, fall back to ANTHROPIC_AUTH_TOKEN
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (apiKey) {
    env.ANTHROPIC_API_KEY = apiKey;
  }

  // Base URL
  if (process.env.ANTHROPIC_BASE_URL) {
    env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
  }

  // Pass through any other ANTHROPIC_ env vars
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("ANTHROPIC_") && v && !env[k]) {
      env[k] = v;
    }
  }

  return env;
}

export class AgentRunner {
  private running = new Map<string, RunningSession>();

  isRunning(sessionId: string): boolean {
    return this.running.has(sessionId);
  }

  async run(sessionId: string, text: string, options: RunOptions): Promise<void> {
    // Interrupt existing run if any
    if (this.running.has(sessionId)) {
      await this.interrupt(sessionId);
    }

    console.log(`[AgentRunner] Starting query session=${sessionId} model=${options.model}`);

    let q: Query;
    try {
      q = query({
        prompt: text,
        options: {
          model: options.model,
          sessionId,
          cwd: options.cwd,
          allowedTools: [
            "Read", "Write", "Edit", "Bash", "Grep", "Glob",
            "WebSearch", "WebFetch", "Agent", "NotebookEdit",
          ],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          includePartialMessages: true,
          maxTurns: 50,
          env: buildSDKEnv(),
        },
      });
    } catch (err) {
      console.error(`[AgentRunner] Failed to create query:`, err);
      options.onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    this.running.set(sessionId, { query: q });

    try {
      let gotResult = false;
      for await (const msg of q) {
        options.onEvent(msg);

        if (msg.type === "result") {
          gotResult = true;
          const cost: CostInfo = {
            totalCost: msg.total_cost_usd ?? 0,
            inputTokens: msg.usage?.input_tokens ?? 0,
            outputTokens: msg.usage?.output_tokens ?? 0,
          };
          console.log(`[AgentRunner] Result: ${msg.subtype} cost=$${cost.totalCost.toFixed(4)}`);
          options.onEnd(cost);
        }
      }
      if (!gotResult) {
        console.log(`[AgentRunner] Generator ended without result`);
        options.onEnd();
      }
    } catch (err) {
      console.error(`[AgentRunner] Error:`, err instanceof Error ? err.message : err);
      if (err instanceof Error && err.name === "AbortError") {
        options.onEnd();
      } else {
        options.onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      this.running.delete(sessionId);
    }
  }

  async interrupt(sessionId: string): Promise<boolean> {
    const session = this.running.get(sessionId);
    if (!session) return false;
    console.log(`[AgentRunner] Interrupting session ${sessionId}`);
    try {
      await session.query.interrupt();
    } catch {
      session.query.close();
    }
    this.running.delete(sessionId);
    return true;
  }

  async closeAll() {
    for (const [id, session] of this.running) {
      session.query.close();
      this.running.delete(id);
    }
  }
}
