import { useState } from "react";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolResultBlockProps {
  content: string;
  isError?: boolean;
}

const MAX_PREVIEW = 500;

export function ToolResultBlock({ content, isError }: ToolResultBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > MAX_PREVIEW;

  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden text-xs",
        isError
          ? "border-red-800/50 bg-error/20"
          : "border-border bg-bg-primary/50",
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-bg-hover/50 transition-colors"
      >
        {isError ? (
          <AlertCircle size={12} className="text-red-400" />
        ) : (
          <CheckCircle size={12} className="text-green-500" />
        )}
        <span className="text-text-muted">
          {isError ? "Error" : "Output"}
          {isLong && ` (${content.length} chars)`}
        </span>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {expanded && (
        <pre className="px-3 pb-2 text-text-secondary whitespace-pre-wrap break-words overflow-x-auto max-h-96 overflow-y-auto">
          {content}
        </pre>
      )}
    </div>
  );
}
