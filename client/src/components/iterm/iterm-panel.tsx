import { ChevronDown, ChevronRight, Terminal, WifiOff, Loader2, FolderOpen } from "lucide-react";
import { useState, useEffect } from "react";
import type { ItermSession } from "@/hooks/use-iterm";

const STORAGE_KEY = "webclaude_iterm_panel_expanded";

function getStoredExpanded(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v !== null ? v === "true" : true;
  } catch {
    return true;
  }
}

/** Primary display title: AI summary > iTerm title > job name > raw name */
function sessionTitle(s: ItermSession): string {
  return s.aiTitle || s.current_title || s.job_name || s.name || "Unnamed";
}

/** Shorten a path for display: keep last 2 segments, prefix ~ if needed */
function shortPath(p: string): string {
  if (!p) return "";
  const parts = p.replace(/\/$/, "").split("/");
  if (parts.length <= 2) return p;
  return "…/" + parts.slice(-2).join("/");
}

interface ItermPanelProps {
  sessions: ItermSession[];
  available: boolean;
  activeSessionId: string | null;
  onSelect: (id: string) => void;
}

export function ItermPanel({ sessions, available, activeSessionId, onSelect }: ItermPanelProps) {
  const [expanded, setExpanded] = useState(getStoredExpanded);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(expanded)); } catch {}
  }, [expanded]);

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Terminal size={12} />
        <span>iTerm2</span>
        {!available ? (
          <WifiOff size={10} className="ml-auto text-text-muted" />
        ) : sessions.length > 0 ? (
          <span className="ml-auto text-accent">{sessions.length}</span>
        ) : null}
      </button>

      {expanded && (
        <div className="py-1">
          {!available ? (
            <div className="px-4 py-2 text-xs text-text-muted italic">iterm-server offline</div>
          ) : sessions.length === 0 ? (
            <div className="px-4 py-2 text-xs text-text-muted italic">No sessions</div>
          ) : (
            sessions.map((s) => {
              const isActive = s.session_id === activeSessionId;
              const title = sessionTitle(s);
              const isLoadingTitle = !s.aiTitle;
              const pwd = s.pwd ? shortPath(s.pwd) : null;

              return (
                <div
                  key={s.session_id}
                  onClick={() => onSelect(s.session_id)}
                  className={`group flex items-start gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors ${
                    isActive ? "bg-bg-tertiary" : "hover:bg-bg-hover"
                  }`}
                >
                  {/* Status dot */}
                  <div className="mt-[5px] w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />

                  <div className="flex-1 min-w-0 space-y-0.5">
                    {/* Line 1 — AI title / session name */}
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-sm truncate text-text-primary leading-snug">
                        {title}
                      </span>
                      {isLoadingTitle && (
                        <Loader2 size={9} className="animate-spin text-text-muted flex-shrink-0" />
                      )}
                    </div>

                    {/* Line 2 — pwd */}
                    <div className="flex items-center gap-1 min-w-0">
                      <FolderOpen size={9} className="text-text-muted flex-shrink-0" />
                      <span
                        className="text-[11px] font-mono text-text-muted truncate"
                        title={s.pwd}
                      >
                        {pwd ?? s.name}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
