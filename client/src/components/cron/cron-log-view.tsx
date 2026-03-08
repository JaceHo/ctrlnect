import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Loader2, Play, Clock, Zap, BotMessageSquare, Terminal, Save, ToggleLeft, ToggleRight } from "lucide-react";
import type { CronJob, CronRunLog, Session, UpdateCronRequest } from "@ctrlnect/shared";
import { API_BASE } from "../../api";

interface CronLogViewProps {
  cron: CronJob;
  sessions: Session[];
  onTrigger: (id: string) => Promise<void>;
  onUpdate: (id: string, req: UpdateCronRequest) => Promise<CronJob>;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "running...";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function StatusIcon({ status }: { status: CronRunLog["status"] }) {
  if (status === "success") return <CheckCircle size={14} className="text-green-400" />;
  if (status === "error") return <XCircle size={14} className="text-red-400" />;
  return <Loader2 size={14} className="text-yellow-400 animate-spin" />;
}

export function CronLogView({ cron, sessions, onTrigger, onUpdate }: CronLogViewProps) {
  const [logs, setLogs] = useState<CronRunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable draft state
  const [draftName, setDraftName] = useState(cron.name);
  const [draftSchedule, setDraftSchedule] = useState(cron.schedule);
  const [draftPrompt, setDraftPrompt] = useState(cron.prompt);
  const [draftEnabled, setDraftEnabled] = useState(cron.enabled);
  const [draftSessionId, setDraftSessionId] = useState(cron.sessionId);

  // Reset draft when cron changes (different cron selected)
  useEffect(() => {
    setDraftName(cron.name);
    setDraftSchedule(cron.schedule);
    setDraftPrompt(cron.prompt);
    setDraftEnabled(cron.enabled);
    setDraftSessionId(cron.sessionId);
  }, [cron.id]);

  const isDirty =
    draftName !== cron.name ||
    draftSchedule !== cron.schedule ||
    draftPrompt !== cron.prompt ||
    draftEnabled !== cron.enabled ||
    draftSessionId !== cron.sessionId;

  const isCommand = cron.type === "command";

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(cron.id, {
        name: draftName,
        schedule: draftSchedule,
        prompt: draftPrompt,
        enabled: draftEnabled,
        sessionId: draftSessionId,
      });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/crons/${cron.id}/logs`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [cron.id]);

  // Refresh logs when a run completes
  useEffect(() => {
    if (cron.lastRun) {
      fetch(`${API_BASE}/api/crons/${cron.id}/logs`)
        .then((r) => r.json())
        .then((data) => setLogs(data))
        .catch(() => {});
    }
  }, [cron.id, cron.lastRun, cron.status]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {isCommand ? (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-orange-500/15 text-orange-400 border border-orange-500/20 flex-shrink-0">
              <Terminal size={9} /> CMD
            </span>
          ) : (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-400 border border-blue-500/20 flex-shrink-0">
              <BotMessageSquare size={9} /> AI
            </span>
          )}
          <input
            className="flex-1 min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none border-b border-transparent focus:border-border transition-colors"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Cron name"
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Enabled toggle */}
          <button
            onClick={() => setDraftEnabled(!draftEnabled)}
            className={`transition-colors ${draftEnabled ? "text-green-400" : "text-text-muted"}`}
            title={draftEnabled ? "Enabled — click to disable" : "Disabled — click to enable"}
          >
            {draftEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
          </button>
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save
            </button>
          )}
          <button
            onClick={() => onTrigger(cron.id)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-bg-secondary border border-border rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          >
            <Play size={12} />
            Run Now
          </button>
        </div>
      </div>

      {/* Editable fields */}
      <div className="px-4 py-3 border-b border-border space-y-3 bg-bg-secondary/30">
        {/* Schedule */}
        <div>
          <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1">Schedule</label>
          <input
            className="w-full bg-bg-secondary border border-border rounded px-2 py-1.5 text-xs font-mono text-text-primary outline-none focus:border-blue-500/50 transition-colors"
            value={draftSchedule}
            onChange={(e) => setDraftSchedule(e.target.value)}
            placeholder="* * * * *"
          />
          {cron.nextRun && (
            <p className="text-[10px] text-text-muted mt-1">Next: {formatDateTime(cron.nextRun)}</p>
          )}
        </div>

        {/* Session selector (AI type only) */}
        {!isCommand && (
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1">Session</label>
            <select
              className="w-full bg-bg-secondary border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-blue-500/50 transition-colors"
              value={draftSessionId}
              onChange={(e) => setDraftSessionId(e.target.value)}
            >
              <option value="">— select session —</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>
        )}

        {/* Prompt / Command */}
        <div>
          <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1">
            {isCommand ? "Command" : "Prompt"}
          </label>
          <textarea
            className={`w-full bg-bg-secondary border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-blue-500/50 transition-colors resize-none ${isCommand ? "font-mono" : ""}`}
            rows={4}
            value={draftPrompt}
            onChange={(e) => setDraftPrompt(e.target.value)}
            placeholder={isCommand ? "shell command..." : "prompt to send to Claude..."}
          />
        </div>
      </div>

      {/* Run history */}
      <div className="px-4 pt-2 pb-1">
        <span className="text-[10px] text-text-muted uppercase tracking-wider">Run History</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-text-muted">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-2">
            <Clock size={24} className="opacity-50" />
            <p className="text-sm">No runs yet</p>
            <p className="text-xs">Trigger a run or wait for the schedule</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((log) => (
              <div key={log.id} className="px-4 py-3 hover:bg-bg-hover/50 transition-colors">
                <div className="flex items-center gap-2">
                  <StatusIcon status={log.status} />
                  <span className="text-xs text-text-primary font-medium">
                    {log.status === "success" ? "Success" : log.status === "error" ? "Failed" : "Running"}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-text-muted">
                    {log.trigger === "manual" ? (
                      <><Zap size={10} /> Manual</>
                    ) : (
                      <><Clock size={10} /> Scheduled</>
                    )}
                  </span>
                  <span className="ml-auto text-[11px] text-text-muted">
                    {formatDuration(log.startedAt, log.endedAt)}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-text-muted">
                  {formatDateTime(log.startedAt)}
                </div>
                {log.output && (
                  <pre className="mt-2 px-2 py-1.5 bg-[#0c0e0d] border border-border/50 rounded text-[11px] text-green-200/80 font-mono whitespace-pre-wrap overflow-x-auto max-h-40">
                    {log.output}
                  </pre>
                )}
                {log.error && (
                  <div className="mt-1.5 px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400 font-mono whitespace-pre-wrap">
                    {log.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
