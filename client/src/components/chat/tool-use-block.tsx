import { useState } from "react";
import {
  Terminal,
  FileText,
  Pencil,
  FolderSearch,
  Search,
  FileOutput,
  Globe,
  ChevronDown,
  ChevronRight,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolUseBlockProps {
  name: string;
  input: unknown;
}

const TOOL_ICONS: Record<string, typeof Terminal> = {
  Bash: Terminal,
  Read: FileText,
  Edit: Pencil,
  Write: FileOutput,
  Glob: FolderSearch,
  Grep: Search,
  WebSearch: Globe,
  WebFetch: Globe,
  Agent: Bot,
};

export function ToolUseBlock({ name, input }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[name] || Terminal;
  const inp = input as Record<string, unknown>;

  // Smart summary based on tool type
  let summary = "";
  switch (name) {
    case "Bash":
      summary = (inp.command as string) || "";
      break;
    case "Read":
      summary = (inp.file_path as string) || "";
      break;
    case "Edit":
      summary = (inp.file_path as string) || "";
      break;
    case "Write":
      summary = (inp.file_path as string) || "";
      break;
    case "Glob":
      summary = (inp.pattern as string) || "";
      break;
    case "Grep":
      summary = (inp.pattern as string) || "";
      break;
    case "WebSearch":
      summary = (inp.query as string) || "";
      break;
    case "WebFetch":
      summary = (inp.url as string) || "";
      break;
    case "Agent":
      summary = (inp.description as string) || (inp.prompt as string)?.slice(0, 50) || "";
      break;
    default:
      summary = JSON.stringify(input).slice(0, 80);
  }

  return (
    <div className="border border-border rounded-lg bg-bg-secondary overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-bg-hover transition-colors"
      >
        <Icon size={14} className="text-accent flex-shrink-0" />
        <span className="font-mono font-medium text-text-primary">{name}</span>
        <span className="text-text-muted truncate flex-1 text-left font-mono">
          {summary}
        </span>
        {expanded ? (
          <ChevronDown size={14} className="text-text-muted" />
        ) : (
          <ChevronRight size={14} className="text-text-muted" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border">
          <pre className="text-xs text-text-secondary mt-2 whitespace-pre-wrap overflow-x-auto">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
