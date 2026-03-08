import { ChevronDown, ChevronRight, MessageCircle } from "lucide-react";
import { useState, useEffect } from "react";

const STORAGE_KEY = "webclaude_wechat_panel_expanded";

function getStoredExpanded(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v !== null ? v === "true" : true;
  } catch {
    return true;
  }
}

interface WeChatPanelProps {
  active: boolean;
  onSelect: () => void;
}

export function WeChatPanel({ active, onSelect }: WeChatPanelProps) {
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
        <MessageCircle size={12} />
        <span>WeChat</span>
      </button>

      {expanded && (
        <div className="py-1">
          <div
            onClick={onSelect}
            className={`flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors ${
              active ? "bg-bg-tertiary" : "hover:bg-bg-hover"
            }`}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
            <span className="text-sm text-text-primary truncate">WeChat Web</span>
          </div>
        </div>
      )}
    </div>
  );
}
