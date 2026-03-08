import { useState, useEffect, useCallback } from "react";
import type { Session } from "@ctrlnect/shared";
import { formatCost } from "@/lib/utils";
import { ModelSelector } from "../input/model-selector";
import { Circle, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiConfig {
  provider: "anthropic" | "openai";
  hasKey: boolean;
  baseUrl: string | null;
}

interface HeaderProps {
  session: Session | null;
  onModelChange: (model: string) => void;
  onShowTaskManager?: () => void;
  hasSubTasks?: boolean;
}

export function Header({ session, onModelChange, onShowTaskManager, hasSubTasks }: HeaderProps) {
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setApiConfig(data))
      .catch(() => {});
  }, []);

  const toggleProvider = useCallback(async () => {
    if (!apiConfig) return;
    const next = apiConfig.provider === "anthropic" ? "openai" : "anthropic";
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: next }),
    });
    const data = await res.json();
    setApiConfig(data);
  }, [apiConfig]);

  if (!session) {
    return (
      <header className="h-11 border-b border-border bg-bg-primary flex items-center px-4">
        <span className="text-text-muted text-sm">
          Select or create a session
        </span>
      </header>
    );
  }

  return (
    <header className="h-11 border-b border-border bg-bg-primary flex items-center px-4 gap-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Circle
          size={7}
          className={cn(
            "flex-shrink-0",
            session.status === "running" && "fill-running text-running pulse-dot",
            session.status === "idle" && "fill-green-500 text-green-500",
            session.status === "error" && "fill-red-500 text-red-500",
          )}
        />
        <h1 className="text-sm font-medium truncate text-text-primary">{session.title}</h1>
      </div>

      {/* API Provider Toggle */}
      {apiConfig && (
        <button
          onClick={toggleProvider}
          className={cn(
            "px-2 py-0.5 rounded text-[10px] font-mono transition-colors border",
            apiConfig.hasKey
              ? "border-green-500/30 text-green-400 hover:bg-green-500/10"
              : "border-red-500/30 text-red-400 hover:bg-red-500/10",
          )}
          title={`Provider: ${apiConfig.provider}${apiConfig.baseUrl ? ` (${apiConfig.baseUrl})` : ""}\nClick to toggle`}
        >
          {apiConfig.provider === "anthropic" ? "Anthropic" : "OpenAI"}
        </button>
      )}

      <ModelSelector value={session.model} onChange={onModelChange} />

      {/* Task Manager Button */}
      {onShowTaskManager && (
        <button
          onClick={onShowTaskManager}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            hasSubTasks
              ? "text-accent bg-accent/10 hover:bg-accent/20"
              : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
          )}
          title="Task Manager"
        >
          <ListTodo size={16} />
        </button>
      )}

      {session.totalCost > 0 && (
        <span className="text-[11px] text-text-muted font-mono">
          {formatCost(session.totalCost)}
        </span>
      )}
    </header>
  );
}
