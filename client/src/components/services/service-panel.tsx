import { useState, useEffect, useCallback } from "react";
import { Terminal, Play, Square, RotateCcw, Trash2, ChevronDown, ChevronRight, FileText, Plus, Search, Loader2, X, Edit2, ToggleLeft, ToggleRight } from "lucide-react";
import type { SystemService, DiscoveredService } from "@/hooks/use-services";

const STORAGE_KEY = "ctrlnect_service_panel_expanded";

function getStoredExpanded(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === "true" : true;
  } catch {
    return true;
  }
}

interface ServicePanelProps {
  services: SystemService[];
  onStart: (id: string) => Promise<boolean>;
  onStop: (id: string) => Promise<boolean>;
  onRestart: (id: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onCreate: (service: { name: string; description?: string; command: string; cwd?: string; logPath?: string }) => Promise<boolean>;
  onUpdate: (id: string, updates: { name?: string; description?: string; command?: string; cwd?: string; logPath?: string }) => Promise<boolean>;
  onToggleEnabled: (id: string, enabled: boolean) => Promise<boolean>;
  onGetLogs: (id: string) => Promise<string>;
  onDiscover: () => Promise<DiscoveredService[]>;
}

export function ServicePanel({
  services,
  onStart,
  onStop,
  onRestart,
  onDelete,
  onCreate,
  onUpdate,
  onToggleEnabled,
  onGetLogs,
  onDiscover,
}: ServicePanelProps) {
  const [expanded, setExpanded] = useState(getStoredExpanded);
  const [showAdd, setShowAdd] = useState(false);
  const [showLogs, setShowLogs] = useState<string | null>(null);
  const [logsContent, setLogsContent] = useState("");
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredService[]>([]);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [newService, setNewService] = useState({ name: "", description: "", command: "", cwd: "", logPath: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", command: "", cwd: "", logPath: "" });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Persist expanded state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(expanded));
    } catch {}
  }, [expanded]);

  const runningCount = services.filter(s => s.status === "running").length;

  const handleViewLogs = async (id: string) => {
    setLoadingLogs(true);
    setShowLogs(id);
    const logs = await onGetLogs(id);
    setLogsContent(logs);
    setLoadingLogs(false);
  };

  const handleDiscover = async () => {
    setLoadingDiscover(true);
    setShowDiscover(true);
    const result = await onDiscover();
    setDiscovered(result);
    setLoadingDiscover(false);
  };

  const handleAddDiscovered = async (service: DiscoveredService) => {
    await onCreate(service);
    setDiscovered(prev => prev.filter(d => d.name !== service.name));
  };

  const handleCreate = async () => {
    if (!newService.name || !newService.command) return;
    await onCreate(newService);
    setNewService({ name: "", description: "", command: "", cwd: "", logPath: "" });
    setShowAdd(false);
  };

  const handleStart = useCallback(async (id: string) => {
    setActionLoading(id);
    await onStart(id);
    setActionLoading(null);
  }, [onStart]);

  const handleStop = useCallback(async (id: string) => {
    setActionLoading(id);
    await onStop(id);
    setActionLoading(null);
  }, [onStop]);

  const handleRestart = useCallback(async (id: string) => {
    setActionLoading(id);
    await onRestart(id);
    setActionLoading(null);
  }, [onRestart]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this service?")) return;
    setActionLoading(id);
    await onDelete(id);
    setActionLoading(null);
  }, [onDelete]);

  const startEdit = (service: SystemService) => {
    setEditingId(service.id);
    setEditForm({
      name: service.name,
      description: service.description || "",
      command: service.command,
      cwd: service.cwd || "",
      logPath: service.logPath || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: "", description: "", command: "", cwd: "", logPath: "" });
  };

  const saveEdit = async () => {
    if (!editingId || !editForm.name || !editForm.command) return;
    await onUpdate(editingId, editForm);
    cancelEdit();
  };

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Terminal size={12} />
        <span>Services</span>
        {runningCount > 0 && <span className="text-green-400">({runningCount})</span>}
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-1">
          {services.map((service) => (
            <div key={service.id}>
              {editingId === service.id ? (
                <div className="p-2 bg-bg-tertiary rounded-md space-y-1.5">
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Name"
                    className="w-full px-2 py-1 bg-bg-secondary border border-border rounded text-xs"
                  />
                  <input
                    value={editForm.command}
                    onChange={(e) => setEditForm({ ...editForm, command: e.target.value })}
                    placeholder="Command"
                    className="w-full px-2 py-1 bg-bg-secondary border border-border rounded text-xs font-mono"
                  />
                  <input
                    value={editForm.cwd}
                    onChange={(e) => setEditForm({ ...editForm, cwd: e.target.value })}
                    placeholder="Working Directory"
                    className="w-full px-2 py-1 bg-bg-secondary border border-border rounded text-xs"
                  />
                  <div className="flex gap-1">
                    <button onClick={saveEdit} className="flex-1 px-2 py-1 bg-accent text-bg-primary rounded text-xs">Save</button>
                    <button onClick={cancelEdit} className="px-2 py-1 bg-bg-tertiary text-text-muted rounded text-xs">Cancel</button>
                  </div>
                </div>
              ) : (
                <div
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-hover group ${actionLoading === service.id ? "opacity-50" : ""} ${!service.enabled ? "opacity-50" : ""}`}
                >
                  <button
                    onClick={() => onToggleEnabled(service.id, !service.enabled)}
                    className={`flex-shrink-0 ${service.enabled ? "text-green-400" : "text-text-muted"}`}
                    title={service.enabled ? "Enabled" : "Disabled"}
                  >
                    {service.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                  </button>
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    service.status === "running" ? "bg-green-400" :
                    service.status === "error" ? "bg-red-400" : "bg-text-muted"
                  }`} />
                  <span className="flex-1 text-xs text-text-primary truncate">{service.name}</span>
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={() => handleViewLogs(service.id)}
                      className="p-1 rounded text-text-muted hover:text-text-primary"
                      title="Logs"
                    >
                      <FileText size={11} />
                    </button>
                    <button
                      onClick={() => startEdit(service)}
                      className="p-1 rounded text-text-muted hover:text-text-primary"
                      title="Edit"
                    >
                      <Edit2 size={11} />
                    </button>
                    {service.status === "running" ? (
                      <button
                        onClick={() => handleStop(service.id)}
                        disabled={actionLoading === service.id}
                        className="p-1 rounded text-text-muted hover:text-red-400 disabled:opacity-50"
                        title="Stop"
                      >
                        <Square size={11} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStart(service.id)}
                        disabled={actionLoading === service.id}
                        className="p-1 rounded text-text-muted hover:text-green-400 disabled:opacity-50"
                        title="Start"
                      >
                        <Play size={11} />
                      </button>
                    )}
                    <button
                      onClick={() => handleRestart(service.id)}
                      disabled={actionLoading === service.id}
                      className="p-1 rounded text-text-muted hover:text-yellow-400 disabled:opacity-50"
                      title="Restart"
                    >
                      <RotateCcw size={11} />
                    </button>
                    <button
                      onClick={() => handleDelete(service.id)}
                      disabled={actionLoading === service.id}
                      className="p-1 rounded text-text-muted hover:text-red-400 disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {showAdd ? (
            <div className="p-2 bg-bg-tertiary rounded-md space-y-2">
              <input
                value={newService.name}
                onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                placeholder="Name"
                className="w-full px-2 py-1 bg-bg-secondary border border-border rounded text-xs"
              />
              <input
                value={newService.command}
                onChange={(e) => setNewService({ ...newService, command: e.target.value })}
                placeholder="Command"
                className="w-full px-2 py-1 bg-bg-secondary border border-border rounded text-xs font-mono"
              />
              <div className="flex gap-1">
                <button onClick={handleCreate} className="flex-1 px-2 py-1 bg-accent text-bg-primary rounded text-xs">Add</button>
                <button onClick={() => setShowAdd(false)} className="px-2 py-1 bg-bg-tertiary text-text-muted rounded text-xs">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1 pt-1">
              <button
                onClick={() => setShowAdd(true)}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary bg-bg-tertiary/50 rounded hover:bg-bg-hover"
              >
                <Plus size={10} /> Add
              </button>
              <button
                onClick={handleDiscover}
                className="flex items-center justify-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary bg-bg-tertiary/50 rounded hover:bg-bg-hover"
                title="Discover services"
              >
                <Search size={10} />
              </button>
            </div>
          )}

          {showDiscover && (
            <div className="p-2 bg-bg-tertiary rounded-md">
              {loadingDiscover ? (
                <div className="flex items-center gap-2 text-text-muted text-xs">
                  <Loader2 size={12} className="animate-spin" /> Scanning...
                </div>
              ) : discovered.length > 0 ? (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {discovered.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <span className="truncate">{s.name}</span>
                      <button onClick={() => handleAddDiscovered(s)} className="p-1 text-green-400 hover:bg-green-400/10 rounded">
                        <Plus size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-text-muted">No services found</span>
              )}
              <button onClick={() => setShowDiscover(false)} className="mt-1 text-xs text-text-muted hover:text-text-primary">
                Close
              </button>
            </div>
          )}
        </div>
      )}

      {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLogs(null)} />
          <div className="relative w-[700px] max-h-[70vh] bg-bg-secondary rounded-xl border border-border shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">Service Logs</h3>
                <button
                  onClick={() => handleViewLogs(showLogs)}
                  className="p-1 rounded text-text-muted hover:text-text-primary"
                  title="Refresh"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
              <button onClick={() => setShowLogs(null)} className="p-1 rounded text-text-muted hover:text-text-primary">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loadingLogs ? (
                <div className="flex items-center gap-2 text-text-muted">
                  <Loader2 size={14} className="animate-spin" /> Loading...
                </div>
              ) : (
                <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap">{logsContent || "No logs"}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
