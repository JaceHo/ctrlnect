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
const BASE_DELAY_MS = 2000;

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

export type ApiProvider = "anthropic" | "openai";

// Persisted provider preference (default: auto-detect)
let preferredProvider: ApiProvider | null = null;

export function setPreferredProvider(provider: ApiProvider | null) {
  preferredProvider = provider;
}

export function detectApiProvider(): { provider: ApiProvider; hasKey: boolean; baseUrl: string | null } {
  // If user has a preference, check that provider first
  if (preferredProvider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    return {
      provider: "openai",
      hasKey: !!key,
      baseUrl: process.env.OPENAI_BASE_URL || null,
    };
  }

  // Default: try Anthropic first, then fall back to OpenAI
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (anthropicKey || preferredProvider === "anthropic") {
    return {
      provider: "anthropic",
      hasKey: !!anthropicKey,
      baseUrl: process.env.ANTHROPIC_BASE_URL || null,
    };
  }

  // Fallback: check OpenAI env vars
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      provider: "openai",
      hasKey: true,
      baseUrl: process.env.OPENAI_BASE_URL || null,
    };
  }

  // Nothing set, default to anthropic
  return { provider: "anthropic", hasKey: false, baseUrl: null };
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

  const detected = detectApiProvider();

  if (detected.provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
    if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
    if (process.env.ANTHROPIC_BASE_URL) env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;

    for (const [k, v] of Object.entries(process.env)) {
      if (k.startsWith("ANTHROPIC_") && v && !env[k]) env[k] = v;
    }
  } else {
    // OpenAI mode: map OPENAI_* env vars to ANTHROPIC_* for the SDK
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
    const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    env.ANTHROPIC_BASE_URL = baseUrl;
  }

  return env;
}

/** Create a query using simple string prompt (most reliable). */
function createSimpleQuery(text: string, model: string, sdkSessionId: string, cwd: string): Query {
  return query({
    prompt: text,
    options: {
      model,
      sessionId: sdkSessionId,
      cwd,
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
}

/** Create a query using AsyncIterable streaming input (richer streaming). */
function createStreamingQuery(text: string, model: string, sdkSessionId: string, cwd: string): Query {
  const inputStream = (async function* () {
    yield {
      type: "user",
      message: text,
      parent_tool_use_id: null,
      session_id: sdkSessionId,
    } as SDKUserMessage;
  })();

  return query({
    prompt: inputStream,
    options: {
      model,
      sessionId: sdkSessionId,
      cwd,
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
}

export class AgentRunner {
  private running = new Map<string, RunningSession>();
  /** Map webclaude sessionId -> SDK sessionId (may rotate on retry) */
  private sdkSessionIds = new Map<string, string>();

  isRunning(sessionId: string): boolean {
    return this.running.has(sessionId);
  }

  /** Get or create a stable SDK sessionId for a webclaude session. */
  private getSDKSessionId(sessionId: string): string {
    let sdkId = this.sdkSessionIds.get(sessionId);
    if (!sdkId) {
      sdkId = sessionId;
      this.sdkSessionIds.set(sessionId, sdkId);
    }
    return sdkId;
  }

  /** Rotate to a fresh SDK sessionId (used on retry after crash). */
  private rotateSDKSessionId(sessionId: string): string {
    const freshId = crypto.randomUUID();
    this.sdkSessionIds.set(sessionId, freshId);
    return freshId;
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

      // On first attempt: use original SDK sessionId + streaming mode
      // On retry: rotate to fresh SDK sessionId + simple string mode
      const sdkSessionId = attempt === 0
        ? this.getSDKSessionId(sessionId)
        : this.rotateSDKSessionId(sessionId);

      const mode = attempt === 0 ? "streaming" : "simple";
      console.log(`[AgentRunner] run session=${sessionId} sdk=${sdkSessionId.slice(0, 8)}... model=${options.model} attempt=${attempt + 1}/${MAX_RETRIES + 1} mode=${mode}`);

      let q: Query;
      try {
        q = mode === "streaming"
          ? createStreamingQuery(text, options.model, sdkSessionId, options.cwd)
          : createSimpleQuery(text, options.model, sdkSessionId, options.cwd);
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

      let gotResult = false;
      try {
        for await (const msg of q) {
          // Log message types in streaming mode
          if (mode === "streaming") {
            console.log(`[AgentRunner] SDK msg:`, msg.type, msg.type === "stream_event" ? (msg as { event?: { type?: string } }).event?.type : "");
          }
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
        // If we already got a result message, the agent completed successfully.
        // Some Claude Code versions exit with code 1 after a successful run —
        // treat that as a clean finish rather than an error.
        if (gotResult) return;

        const error = err instanceof Error ? err : new Error(String(err));
        const detail = `${error.message}${error.stack ? `\n${error.stack.split("\n").slice(1, 3).join("\n")}` : ""}`;
        console.error(`[AgentRunner] Error (attempt ${attempt + 1}):`, detail);

        if (isNonRetryable(error)) {
          if (error.name === "AbortError") {
            options.onEnd();
          } else {
            options.onError(error, false);
          }
          return;
        }

        if (attempt >= MAX_RETRIES) {
          options.onError(
            new Error(`Failed after ${MAX_RETRIES + 1} attempts. Last error: ${error.message}`),
            false,
          );
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
