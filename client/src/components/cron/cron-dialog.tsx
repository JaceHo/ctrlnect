import { useState, useEffect } from "react";
import { X, BotMessageSquare, Terminal } from "lucide-react";
import type { CronJob, Session, CreateCronRequest, UpdateCronRequest } from "@ctrlnect/shared";

const PRESETS = [
  { label: "Every 1 min", value: "*/1 * * * *" },
  { label: "Every 5 min", value: "*/5 * * * *" },
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Daily 9am", value: "0 9 * * *" },
  { label: "Daily midnight", value: "0 0 * * *" },
];

interface CronDialogProps {
  open: boolean;
  onClose: () => void;
  sessions: Session[];
  editingCron?: CronJob | null;
  onCreate: (req: CreateCronRequest) => Promise<CronJob>;
  onUpdate: (id: string, req: UpdateCronRequest) => Promise<CronJob>;
}

export function CronDialog({
  open,
  onClose,
  sessions,
  editingCron,
  onCreate,
  onUpdate,
}: CronDialogProps) {
  const [type, setType] = useState<"prompt" | "command">("prompt");
  const [name, setName] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [schedule, setSchedule] = useState("*/5 * * * *");
  const [prompt, setPrompt] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (editingCron) {
      setType(editingCron.type ?? "prompt");
      setName(editingCron.name);
      setSessionId(editingCron.sessionId);
      setSchedule(editingCron.schedule);
      setPrompt(editingCron.prompt);
      setEnabled(editingCron.enabled);
    } else {
      setType("prompt");
      setName("");
      setSessionId(sessions[0]?.id ?? "");
      setSchedule("*/5 * * * *");
      setPrompt("");
      setEnabled(true);
    }
  }, [editingCron, open, sessions]);

  if (!open) return null;

  const isCommand = type === "command";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = name.trim() && schedule.trim() && prompt.trim() && (isCommand || sessionId);
    if (!isValid) return;

    if (editingCron) {
      await onUpdate(editingCron.id, { type, name, sessionId: isCommand ? "" : sessionId, schedule, prompt, enabled });
    } else {
      await onCreate({ type, name, sessionId: isCommand ? "" : sessionId, schedule, prompt, enabled });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-bg-primary border border-border rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-medium text-text-primary">
            {editingCron ? "Edit Cron Job" : "New Cron Job"}
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">

          {/* Type toggle */}
          {!editingCron && (
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Type</label>
              <div className="flex rounded-md border border-border overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setType("prompt")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${
                    !isCommand ? "bg-text-primary text-bg-primary" : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  <BotMessageSquare size={13} />
                  AI Prompt
                </button>
                <button
                  type="button"
                  onClick={() => setType("command")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors border-l border-border ${
                    isCommand ? "bg-text-primary text-bg-primary" : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  <Terminal size={13} />
                  Shell Command
                </button>
              </div>
              <p className="mt-1 text-[10px] text-text-muted">
                {isCommand
                  ? "Runs a shell command on schedule — synced to system crontab."
                  : "Sends a prompt to Claude in the selected session."}
              </p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isCommand ? "e.g. Nightly backup" : "e.g. Daily summary"}
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-text-muted"
            />
          </div>

          {/* Session — only for prompt type */}
          {!isCommand && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Session</label>
              <select
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-md text-text-primary focus:outline-none focus:border-text-muted"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Schedule */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">Schedule (cron expression)</label>
            <input
              type="text"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="*/5 * * * *"
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-text-muted font-mono"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setSchedule(p.value)}
                  className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                    schedule === p.value
                      ? "bg-text-primary text-bg-primary border-text-primary"
                      : "border-border text-text-muted hover:text-text-secondary hover:border-text-muted"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt / Command */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              {isCommand ? "Shell Command" : "Prompt"}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={isCommand ? "/usr/local/bin/backup.sh --quiet" : "What should Claude do?"}
              rows={3}
              className={`w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-text-muted resize-none ${
                isCommand ? "font-mono" : ""
              }`}
            />
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                enabled ? "bg-green-600" : "bg-bg-secondary border border-border"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                }`}
              />
            </button>
            <span className="text-xs text-text-secondary">
              {enabled ? "Enabled" : "Disabled"}
              {isCommand && enabled && (
                <span className="ml-1 text-text-muted">(will appear in system crontab)</span>
              )}
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-sm bg-text-primary text-bg-primary rounded-md hover:opacity-90 transition-opacity"
            >
              {editingCron ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
