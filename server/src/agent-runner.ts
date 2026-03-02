import { query, type Query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { CostInfo } from "@webclaude/shared";

interface RunningSession {
  query: Query;
  aborted: boolean;
}

interface RunOptions {
  model: string;
  cwd: string;
  onEvent: (event: SDKMessage) => void;
  onEnd: (cost?: CostInfo) => void;
  /** @param willRetry - true if the runner will auto-retry after this error */
  onError: (err: Error, willRetry: boolean) => void;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1500;

/** Errors that should NOT be retried (auth, config, user abort). */
function isNonRetryable(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    err.name === "AbortError" ||
    msg.includes("api key") ||
    msg.includes("authentication") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("invalid_api_key") ||
    msg.includes("permission denied")
  );
}

function buildSDKEnv(): Record<string, string> {
  const env: Record<string, string> = {
    HOME: process.env.HOME || "",
    PATH: process.env.PATH || "",
    SHELL: process.env.SHELL || "",
    USER: process.env.USER || "",
    LANG: process.env.LANG || "en_US.UTF-8",
    TERM: process.env.TERM || "xterm-256color",
  };

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  if (process.env.ANTHROPIC_BASE_URL) env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;

  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("ANTHROPIC_") && v && !env[k]) env[k] = v;
  }

  return env;
}

export class AgentRunner {
  private running = new Map<string, RunningSession>();

  isRunning(sessionId: string): boolean {
    return this.running.has(sessionId);
  }

  async run(sessionId: string, text: string, options: RunOptions): Promise<void> {
    if (this.running.has(sessionId)) {
      await this.interrupt(sessionId);
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Check if session was aborted between retries
      const existing = this.running.get(sessionId);
      if (existing?.aborted) {
        this.running.delete(sessionId);
        options.onEnd();
        return;
      }

      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[AgentRunner] Retry ${attempt}/${MAX_RETRIES} for session=${sessionId} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }

      console.log(`[AgentRunner] run session=${sessionId} model=${options.model} attempt=${attempt + 1}/${MAX_RETRIES + 1}`);

      // Use streaming input mode (AsyncIterable) to get real-time stream_event deltas
      const inputStream = (async function* () {
        yield {
          type: "user",
          message: { role: "user", content: text },
          parent_tool_use_id: null,
          session_id: sessionId,
        } as SDKUserMessage;
      })();

      let q: Query;
      try {
        q = query({
          prompt: inputStream,
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
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`[AgentRunner] Failed to create query (attempt ${attempt + 1}):`, error.message);

        if (isNonRetryable(error) || attempt >= MAX_RETRIES) {
          options.onError(error, false);
          return;
        }
        options.onError(error, true);
        continue;
      }

      this.running.set(sessionId, { query: q, aborted: false });

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
          options.onEnd();
        }
        // Success — break out of retry loop
        return;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`[AgentRunner] Error (attempt ${attempt + 1}):`, error.message);

        if (isNonRetryable(error)) {
          if (error.name === "AbortError") {
            options.onEnd();
          } else {
            options.onError(error, false);
          }
          return;
        }

        if (attempt >= MAX_RETRIES) {
          options.onError(error, false);
          return;
        }

        // Notify client we hit an error but will retry
        options.onError(error, true);
      } finally {
        this.running.delete(sessionId);
      }
    }
  }

  async interrupt(sessionId: string): Promise<boolean> {
    const session = this.running.get(sessionId);
    if (!session) return false;
    console.log(`[AgentRunner] Interrupting session ${sessionId}`);
    session.aborted = true;
    try {
      await session.query.interrupt();
    } catch {
      session.query.close();
    }
    this.running.delete(sessionId);
    return true;
  }

  async closeAll() {
    for (const [, session] of this.running) {
      session.aborted = true;
      session.query.close();
    }
    this.running.clear();
  }
}
