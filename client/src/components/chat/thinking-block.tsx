import { useState } from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingBlockProps {
  text: string;
}

export function ThinkingBlock({ text }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  return (
    <div className="border border-dashed border-border-light rounded-lg bg-thinking/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
      >
        <Brain size={14} className="text-amber-500" />
        <span>Thinking</span>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {!expanded && (
          <span className="text-text-muted truncate flex-1 text-left">
            {text.slice(0, 80)}...
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
          {text}
        </div>
      )}
    </div>
  );
}
