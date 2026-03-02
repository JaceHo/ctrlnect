import { Bot, Loader2 } from "lucide-react";

interface AgentStatusProps {
  name: string;
  isRunning: boolean;
}

export function AgentStatus({ name, isRunning }: AgentStatusProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border text-xs text-text-secondary">
      {isRunning ? (
        <Loader2 size={12} className="animate-spin text-accent" />
      ) : (
        <Bot size={12} className="text-accent" />
      )}
      <span>Subagent: {name}</span>
    </div>
  );
}
