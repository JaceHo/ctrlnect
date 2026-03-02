import type { Session } from "@webclaude/shared";
import { SessionItem } from "./session-item";

interface SessionListProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SessionList({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
}: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="p-4 text-center text-text-muted text-sm">
        No sessions yet
      </div>
    );
  }

  return (
    <div className="py-1">
      {sessions.map((session) => (
        <SessionItem
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          onSelect={() => onSelect(session.id)}
          onDelete={() => onDelete(session.id)}
        />
      ))}
    </div>
  );
}
