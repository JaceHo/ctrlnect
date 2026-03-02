import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { Session, SessionStatus } from "@webclaude/shared";

const DATA_DIR = join(import.meta.dir, "../../data");
const SESSIONS_FILE = join(DATA_DIR, "sessions.json");

export class SessionStore {
  private sessions = new Map<string, Session>();
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (existsSync(SESSIONS_FILE)) {
        const data = JSON.parse(readFileSync(SESSIONS_FILE, "utf-8"));
        for (const s of data) {
          // Reset running sessions to idle on restart
          if (s.status === "running") s.status = "idle";
          this.sessions.set(s.id, s);
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
      SESSIONS_FILE,
      JSON.stringify([...this.sessions.values()], null, 2),
    );
  }

  getAll(): Session[] {
    return [...this.sessions.values()].sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() -
        new Date(a.lastActivity).getTime(),
    );
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  create(partial: {
    title?: string;
    model?: string;
    cwd?: string;
  }): Session {
    const id = crypto.randomUUID();
    const session: Session = {
      id,
      title: partial.title || "New Session",
      model: partial.model || "claude-sonnet-4-6",
      status: "idle",
      cwd: partial.cwd || process.cwd(),
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messageCount: 0,
      totalCost: 0,
    };
    this.sessions.set(id, session);
    this.scheduleSave();
    return session;
  }

  update(id: string, changes: Partial<Session>): Session | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    Object.assign(session, changes, { lastActivity: new Date().toISOString() });
    this.sessions.set(id, session);
    this.scheduleSave();
    return session;
  }

  delete(id: string): boolean {
    const deleted = this.sessions.delete(id);
    if (deleted) this.scheduleSave();
    return deleted;
  }

  updateStatus(id: string, status: SessionStatus) {
    return this.update(id, { status });
  }

  incrementMessages(id: string) {
    const session = this.sessions.get(id);
    if (session) {
      return this.update(id, { messageCount: session.messageCount + 1 });
    }
    return null;
  }

  addCost(id: string, cost: number) {
    const session = this.sessions.get(id);
    if (session) {
      return this.update(id, { totalCost: session.totalCost + cost });
    }
    return null;
  }
}
