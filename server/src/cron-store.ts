import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { CronJob, CronRunLog } from "@ctrlnect/shared";

const DATA_DIR = join(import.meta.dir, "../../data");
const CRONS_FILE = join(DATA_DIR, "crons.json");
const CRON_LOGS_DIR = join(DATA_DIR, "cron-logs");

export class CronStore {
  private crons = new Map<string, CronJob>();
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (existsSync(CRONS_FILE)) {
        const data = JSON.parse(readFileSync(CRONS_FILE, "utf-8"));
        for (const c of data) {
          if (c.status === "running") c.status = "idle";
          if (!c.type) c.type = "prompt"; // back-fill legacy entries
          this.crons.set(c.id, c);
        }
      }
    } catch {
      // Start fresh if corrupt
    }
  }

  private scheduleSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.saveToDisk(), 500);
  }

  private saveToDisk() {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(
      CRONS_FILE,
      JSON.stringify([...this.crons.values()], null, 2),
    );
  }

  getAll(): CronJob[] {
    return [...this.crons.values()].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  get(id: string): CronJob | undefined {
    return this.crons.get(id);
  }

  create(partial: {
    type?: "prompt" | "command";
    sessionId?: string;
    name: string;
    schedule: string;
    prompt: string;
    enabled?: boolean;
  }): CronJob {
    const id = crypto.randomUUID();
    const cron: CronJob = {
      id,
      type: partial.type ?? "prompt",
      sessionId: partial.sessionId ?? "",
      name: partial.name,
      schedule: partial.schedule,
      prompt: partial.prompt,
      enabled: partial.enabled ?? true,
      status: "idle",
      lastRun: null,
      nextRun: null,
      lastError: null,
      createdAt: new Date().toISOString(),
    };
    this.crons.set(id, cron);
    this.scheduleSave();
    return cron;
  }

  update(id: string, changes: Partial<CronJob>): CronJob | null {
    const cron = this.crons.get(id);
    if (!cron) return null;
    Object.assign(cron, changes);
    this.crons.set(id, cron);
    this.scheduleSave();
    return cron;
  }

  delete(id: string): boolean {
    const deleted = this.crons.delete(id);
    if (deleted) this.scheduleSave();
    return deleted;
  }

  // --- Run logs ---

  private logsFilePath(cronId: string): string {
    return join(CRON_LOGS_DIR, `${cronId}.json`);
  }

  getLogs(cronId: string): CronRunLog[] {
    try {
      const file = this.logsFilePath(cronId);
      if (existsSync(file)) {
        const data = JSON.parse(readFileSync(file, "utf-8")) as CronRunLog[];
        // Mark any stale "running" logs as error on load
        for (const log of data) {
          if (log.status === "running") {
            log.status = "error";
            log.error = "Server restarted during execution";
            log.endedAt = log.startedAt;
          }
        }
        return data;
      }
    } catch {
      // ignore
    }
    return [];
  }

  appendLog(log: CronRunLog): void {
    mkdirSync(CRON_LOGS_DIR, { recursive: true });
    const file = this.logsFilePath(log.cronId);
    const logs = this.getLogs(log.cronId);
    const idx = logs.findIndex((l) => l.id === log.id);
    if (idx >= 0) {
      logs[idx] = log;
    } else {
      logs.push(log);
    }
    // Keep last 100 logs per cron
    const trimmed = logs.slice(-100);
    writeFileSync(file, JSON.stringify(trimmed, null, 2));
  }
}
