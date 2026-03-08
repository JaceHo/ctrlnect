import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import type { PersistedMessage } from "@ctrlnect/shared";

const DATA_DIR = join(import.meta.dir, "../../data/messages");

export class MessageStore {
  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  private filePath(sessionId: string): string {
    return join(DATA_DIR, `${sessionId}.json`);
  }

  /** Load all messages for a session, sorted chronologically by timestamp. */
  getAll(sessionId: string): PersistedMessage[] {
    const fp = this.filePath(sessionId);
    try {
      if (existsSync(fp)) {
        const messages = JSON.parse(readFileSync(fp, "utf-8")) as PersistedMessage[];
        return messages.sort((a, b) =>
          (a.timestamp ?? "").localeCompare(b.timestamp ?? ""),
        );
      }
    } catch {
      // Corrupt file — start fresh
    }
    return [];
  }

  /** Append a message and persist. */
  append(sessionId: string, message: PersistedMessage): void {
    const messages = this.getAll(sessionId);

    // Deduplicate by id: replace existing message with same id, or append
    const idx = messages.findIndex((m) => m.id === message.id);
    if (idx >= 0) {
      messages[idx] = message;
    } else {
      messages.push(message);
    }

    this.save(sessionId, messages);
  }

  /** Delete all messages for a session. */
  delete(sessionId: string): void {
    const fp = this.filePath(sessionId);
    try {
      if (existsSync(fp)) unlinkSync(fp);
    } catch {
      // Ignore
    }
  }

  private save(sessionId: string, messages: PersistedMessage[]): void {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(this.filePath(sessionId), JSON.stringify(messages, null, 2));
  }
}
