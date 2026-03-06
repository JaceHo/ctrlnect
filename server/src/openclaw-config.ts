import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const OPENCLAW_DIR = join(homedir(), ".openclaw");
export const OPENCLAW_CONFIG_FILE = join(OPENCLAW_DIR, "config.json");

// ── Config types ──────────────────────────────────────────────────────────────

export interface FeishuSessionConfig {
  /** Direct Feishu DM chat_id (e.g. "oc_xxx"). Fastest — no API lookup needed. */
  chat_id?: string;
  /** User's open_id (e.g. "ou_xxx"). Bridge will resolve chat_id on startup. */
  open_id?: string;
  /** Display name shown in the session panel. */
  name: string;
  /** Claude model to use for this DM. Defaults to "claude-sonnet-4-6". */
  model?: string;
  /** Working directory passed to Claude. Defaults to "~" (home dir). */
  cwd?: string;
  /**
   * When true, Claude automatically replies to every incoming Feishu message.
   * When false, messages appear in webclaude but you must type a reply manually.
   */
  auto_reply?: boolean;
}

export interface FeishuConfig {
  /** Master switch – set to true to activate the integration. */
  enabled: boolean;
  /** Feishu app_id from the developer console. */
  app_id: string;
  /** Feishu app_secret from the developer console. */
  app_secret: string;
  /** How often to poll for new messages (milliseconds). Default 5000. */
  poll_interval_ms?: number;
  /** List of Feishu DM contacts to bridge as sessions. */
  sessions: FeishuSessionConfig[];
}

export interface OpenClawConfig {
  feishu?: FeishuConfig;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: OpenClawConfig = {
  feishu: {
    enabled: false,
    app_id: "",
    app_secret: "",
    poll_interval_ms: 5000,
    sessions: [],
  },
};

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Reads ~/.openclaw/config.json. Creates the file (with defaults) if absent.
 * Never throws – returns defaults on any parse error.
 */
export function loadOpenClawConfig(): OpenClawConfig {
  if (!existsSync(OPENCLAW_CONFIG_FILE)) {
    try {
      mkdirSync(OPENCLAW_DIR, { recursive: true });
      writeFileSync(
        OPENCLAW_CONFIG_FILE,
        JSON.stringify(DEFAULT_CONFIG, null, 2),
        "utf-8",
      );
      console.log(
        `[OpenClaw] Created default config at ${OPENCLAW_CONFIG_FILE}`,
      );
    } catch (err) {
      console.warn("[OpenClaw] Could not create config file:", err);
    }
    return DEFAULT_CONFIG;
  }

  try {
    const raw = readFileSync(OPENCLAW_CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as OpenClawConfig;
  } catch (err) {
    console.warn(
      "[OpenClaw] Failed to parse config, using defaults:",
      err,
    );
    return DEFAULT_CONFIG;
  }
}

/** Convenience: returns the Feishu config only when it's enabled and usable. */
export function getFeishuConfig(
  cfg: OpenClawConfig,
): FeishuConfig | null {
  const f = cfg.feishu;
  if (!f?.enabled || !f.app_id || !f.app_secret) return null;
  return f;
}
