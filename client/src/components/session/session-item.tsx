import { Trash2, Circle } from "lucide-react";
import type { Session } from "@webclaude/shared";
import { cn, formatTime, truncate } from "@/lib/utils";

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
}: SessionItemProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group flex items-start gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors",
        isActive ? "bg-bg-tertiary" : "hover:bg-bg-hover",
      )}
    >
      <Circle
        size={6}
        className={cn(
          "mt-1.5 flex-shrink-0",
          session.status === "running" && "fill-running text-running pulse-dot",
          session.status === "idle" && "fill-text-muted text-text-muted",
          session.status === "error" && "fill-red-500 text-red-500",
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{truncate(session.title, 30)}</div>
        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
          <span>{session.model.replace("claude-", "").split("-")[0]}</span>
          <span>{formatTime(session.lastActivity)}</span>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-red-400 transition-all"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
