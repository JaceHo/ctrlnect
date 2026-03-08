import type { CronStore } from "./cron-store.js";
import type { ConnectionManager } from "./connection-manager.js";
import type { CronJob, CronRunLog } from "@ctrlnect/shared";
import { runShellCommand } from "./crontab-service.js";

// Minimal cron expression parser supporting:
// * (every), */N (every N), N (exact match), N,M (list)
// Fields: minute hour day-of-month month day-of-week
function fieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;

  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return !isNaN(step) && step > 0 && value % step === 0;
  }

  // Support comma-separated values
  const parts = field.split(",");
  return parts.some((p) => parseInt(p.trim(), 10) === value);
}

function cronMatches(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return (
    fieldMatches(minute, date.getMinutes()) &&
    fieldMatches(hour, date.getHours()) &&
    fieldMatches(dayOfMonth, date.getDate()) &&
    fieldMatches(month, date.getMonth() + 1) &&
    fieldMatches(dayOfWeek, date.getDay())
  );
}

/** Calculate approximate next run time from a cron expression. */
function computeNextRun(expression: string): string | null {
  const now = new Date();
  // Check every minute for the next 48 hours
  for (let i = 1; i <= 2880; i++) {
    const candidate = new Date(now.getTime() + i * 60_000);
    candidate.setSeconds(0, 0);
    if (cronMatches(expression, candidate)) {
      return candidate.toISOString();
    }
  }
  return null;
}

export class CronScheduler {
  private interval: ReturnType<typeof setInterval> | null = null;
  private onTrigger: ((cron: CronJob) => Promise<void>) | null = null;

  constructor(
    private cronStore: CronStore,
    private connectionManager: ConnectionManager,
  ) {}

  /** Set the callback that fires when a cron job triggers. */
  setTriggerHandler(handler: (cron: CronJob) => Promise<void>) {
    this.onTrigger = handler;
  }

  /** Start checking for due jobs every 30 seconds. */
  start() {
    // Compute initial nextRun for all crons
    for (const cron of this.cronStore.getAll()) {
      if (cron.enabled && !cron.nextRun) {
        this.cronStore.update(cron.id, { nextRun: computeNextRun(cron.schedule) });
      }
    }

    this.interval = setInterval(() => this.tick(), 30_000);
    console.log("[CronScheduler] Started (checking every 30s)");
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /** Manually trigger a cron job. */
  async trigger(cronId: string) {
    const cron = this.cronStore.get(cronId);
    if (!cron) return;
    await this.executeCron(cron, "manual");
  }

  /** Update nextRun when a cron's schedule changes. */
  refreshNextRun(cronId: string) {
    const cron = this.cronStore.get(cronId);
    if (!cron) return;
    const nextRun = cron.enabled ? computeNextRun(cron.schedule) : null;
    this.cronStore.update(cronId, { nextRun });
    this.broadcastCronUpdate(cronId);
  }

  private async tick() {
    const now = new Date();
    now.setSeconds(0, 0);

    for (const cron of this.cronStore.getAll()) {
      if (!cron.enabled || cron.status === "running") continue;
      if (cronMatches(cron.schedule, now)) {
        // Avoid re-triggering if we already ran this minute
        if (cron.lastRun) {
          const lastRunDate = new Date(cron.lastRun);
          lastRunDate.setSeconds(0, 0);
          if (lastRunDate.getTime() === now.getTime()) continue;
        }
        this.executeCron(cron, "schedule");
      }
    }
  }

  private async executeCron(cron: CronJob, trigger: "schedule" | "manual" = "schedule") {
    const log: CronRunLog = {
      id: crypto.randomUUID(),
      cronId: cron.id,
      status: "running",
      startedAt: new Date().toISOString(),
      endedAt: null,
      error: null,
      output: null,
      trigger,
    };

    this.cronStore.update(cron.id, { status: "running" });
    this.cronStore.appendLog(log);
    this.broadcastCronUpdate(cron.id);

    try {
      if (cron.type === "command") {
        // Execute shell command directly
        const { output, exitCode } = await runShellCommand(cron.prompt);
        log.output = output || null;
        if (exitCode !== 0) {
          throw new Error(`Exit code ${exitCode}${output ? `\n${output}` : ""}`);
        }
      } else {
        // Execute as AI prompt via Claude session
        if (!this.onTrigger) throw new Error("No prompt trigger handler set");
        await this.onTrigger(cron);
      }

      log.status = "success";
      log.endedAt = new Date().toISOString();
      this.cronStore.update(cron.id, {
        status: "idle",
        lastRun: new Date().toISOString(),
        lastError: null,
        nextRun: computeNextRun(cron.schedule),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.status = "error";
      log.error = errorMessage;
      log.endedAt = new Date().toISOString();
      this.cronStore.update(cron.id, {
        status: "error",
        lastRun: new Date().toISOString(),
        lastError: errorMessage,
        nextRun: computeNextRun(cron.schedule),
      });
    }

    this.cronStore.appendLog(log);
    this.broadcastCronUpdate(cron.id);
  }

  private broadcastCronUpdate(cronId: string) {
    const cron = this.cronStore.get(cronId);
    if (cron) {
      this.connectionManager.broadcastAll({
        type: "cron_update",
        cron,
      });
    }
  }
}
