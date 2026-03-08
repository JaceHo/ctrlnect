import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Play, Pencil, Trash2, Clock, Download, BotMessageSquare, Terminal } from "lucide-react";
import type { CronJob, Session, CreateCronRequest, UpdateCronRequest } from "@ctrlnect/shared";
import { CronDialog } from "./cron-dialog";

interface CronPanelProps {
  crons: CronJob[];
  sessions: Session[];
  activeCronId: string | null;
  onSelectCron: (id: string | null) => void;
  onCreateCron: (req: CreateCronRequest) => Promise<CronJob>;
  onUpdateCron: (id: string, req: UpdateCronRequest) => Promise<CronJob>;
  onDeleteCron: (id: string) => Promise<void>;
  onTriggerCron: (id: string) => Promise<void>;
  onImportSystemCrons: () => Promise<{ imported: number }>;
}

function StatusDot({ status }: { status: CronJob["status"] }) {
  const color =
    status === "running"
      ? "bg-yellow-400"
      : status === "error"
        ? "bg-red-400"
        : "bg-green-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${color} flex-shrink-0`} />;
}

function TypeBadge({ type }: { type: CronJob["type"] }) {
  return type === "command" ? (
    <span className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-mono bg-orange-500/15 text-orange-400 border border-orange-500/20 flex-shrink-0">
      <Terminal size={8} />CMD
    </span>
  ) : (
    <span className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-mono bg-blue-500/15 text-blue-400 border border-blue-500/20 flex-shrink-0">
      <BotMessageSquare size={8} />AI
    </span>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function CronPanel({
  crons,
  sessions,
  activeCronId,
  onSelectCron,
  onCreateCron,
  onUpdateCron,
  onDeleteCron,
  onTriggerCron,
  onImportSystemCrons,
}: CronPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCron, setEditingCron] = useState<CronJob | null>(null);
  const [importing, setImporting] = useState(false);

  const promptCrons = crons.filter((c) => c.type !== "command");
  const commandCrons = crons.filter((c) => c.type === "command");

  const handleEdit = (e: React.MouseEvent, cron: CronJob) => {
    e.stopPropagation();
    setEditingCron(cron);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingCron(null);
    setDialogOpen(true);
  };

  const handleImport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setImporting(true);
    try {
      const result = await onImportSystemCrons();
      if (result.imported === 0) {
        alert("No new system crontab entries found to import.");
      }
    } catch {
      alert("Failed to import system crontab.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="border-t border-border">
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-bg-hover transition-colors"
          onClick={() => setCollapsed(!collapsed)}
        >
          <div className="flex items-center gap-1.5 text-xs text-text-secondary font-medium">
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <Clock size={13} />
            Crons
            {crons.length > 0 && (
              <span className="text-text-muted">
                ({promptCrons.length > 0 && <span className="text-blue-400">{promptCrons.length} AI</span>}
                {promptCrons.length > 0 && commandCrons.length > 0 && ", "}
                {commandCrons.length > 0 && <span className="text-orange-400">{commandCrons.length} CMD</span>})
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleImport}
              className="p-0.5 text-text-muted hover:text-text-primary transition-colors"
              title="Re-import from system crontab"
              disabled={importing}
            >
              <Download size={13} className={importing ? "animate-pulse" : ""} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleNew(); }}
              className="text-text-muted hover:text-text-primary transition-colors"
              title="New cron job"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {!collapsed && (
          <div>
            {crons.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-text-muted text-center">
                No cron jobs yet
              </div>
            ) : (
              crons.map((cron) => (
                <div
                  key={cron.id}
                  className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                    activeCronId === cron.id ? "bg-bg-hover" : "hover:bg-bg-hover"
                  }`}
                  onClick={() => onSelectCron(cron.id)}
                >
                  <StatusDot status={cron.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-text-primary truncate">
                        {cron.name}
                        {!cron.enabled && (
                          <span className="ml-1.5 text-[10px] text-text-muted">(off)</span>
                        )}
                      </span>
                      <TypeBadge type={cron.type ?? "prompt"} />
                    </div>
                    <div className="text-[10px] text-text-muted font-mono">
                      {cron.schedule}
                      {cron.lastRun && (
                        <span className="ml-2">last: {formatTime(cron.lastRun)}</span>
                      )}
                    </div>
                  </div>
                  <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); onTriggerCron(cron.id); }}
                      className="p-1 text-text-muted hover:text-text-primary transition-colors"
                      title="Trigger now"
                    >
                      <Play size={12} />
                    </button>
                    <button
                      onClick={(e) => handleEdit(e, cron)}
                      className="p-1 text-text-muted hover:text-text-primary transition-colors"
                      title="Edit"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteCron(cron.id); }}
                      className="p-1 text-text-muted hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <CronDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingCron(null);
        }}
        sessions={sessions}
        editingCron={editingCron}
        onCreate={onCreateCron}
        onUpdate={onUpdateCron}
      />
    </>
  );
}
