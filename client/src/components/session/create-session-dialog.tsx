import { useState } from "react";
import { X } from "lucide-react";
import type { CreateSessionRequest } from "@webclaude/shared";
import { AVAILABLE_MODELS } from "@webclaude/shared";

interface CreateSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (req: CreateSessionRequest) => void;
}

export function CreateSessionDialog({
  open,
  onClose,
  onCreate,
}: CreateSessionDialogProps) {
  const [title, setTitle] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [cwd, setCwd] = useState("");

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      title: title || undefined,
      model,
      cwd: cwd || undefined,
    });
    setTitle("");
    setCwd("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bg-secondary border border-border rounded-xl p-6 w-[400px]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">New Session</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-hover text-text-muted"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New Session"
              className="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border text-sm focus:outline-none focus:border-accent"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Working Directory
            </label>
            <input
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="(server cwd)"
              className="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-bg-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm bg-accent text-bg-primary hover:bg-accent-hover font-medium"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
