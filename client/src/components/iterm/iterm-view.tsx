import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, Send, Terminal } from "lucide-react";
import type { ItermSession, ItermContent } from "@/hooks/use-iterm";

interface ItermViewProps {
  session: ItermSession;
  onGetContent: (id: string, lines?: number, name?: string) => Promise<ItermContent | null>;
  onSendText: (id: string, text: string) => Promise<boolean>;
}

export function ItermView({ session, onGetContent, onSendText }: ItermViewProps) {
  const [content, setContent] = useState<ItermContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Human-readable title: AI summary first, then job name, then iTerm name
  const displayTitle = session.aiTitle || session.current_title || session.job_name || session.name || "Unnamed";
  const displaySub = session.aiTitle
    ? (session.job_name || session.name)
    : "";

  const fetchContent = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const data = await onGetContent(session.session_id, 300, session.job_name || session.name);
    if (data) {
      setContent(data);
      if (autoScroll) {
        requestAnimationFrame(() => {
          if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
          }
        });
      }
    }
    if (showLoading) setLoading(false);
  }, [session.session_id, onGetContent, autoScroll]);

  // Reset and load when session changes
  useEffect(() => {
    setContent(null);
    setAutoScroll(true);
    fetchContent(true);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => fetchContent(), 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [session.session_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    inputRef.current?.focus();
  }, [session.session_id]);

  const handleScroll = () => {
    const el = outputRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(atBottom);
  };

  const scrollToBottom = () => {
    const el = outputRef.current;
    if (el) { el.scrollTop = el.scrollHeight; setAutoScroll(true); }
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    const text = input;
    setInput("");
    setSending(true);
    await onSendText(session.session_id, text + "\n");
    setSending(false);
    await fetchContent();
    scrollToBottom();
    inputRef.current?.focus();
  }, [input, sending, session.session_id, onSendText, fetchContent]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Header */}
      <header className="h-11 border-b border-border bg-bg-primary flex items-center px-4 gap-3 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
        <Terminal size={13} className="text-text-muted flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate text-text-primary leading-tight">
            {displayTitle}
          </div>
          {displaySub && (
            <div className="text-[10px] text-text-muted font-mono leading-tight truncate">
              {displaySub}
            </div>
          )}
        </div>
        <button
          onClick={() => fetchContent(false)}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors flex-shrink-0"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      {/* Terminal output */}
      <div className="relative flex-1 min-h-0 bg-[#0c0e0d]">
        <div
          ref={outputRef}
          onScroll={handleScroll}
          className="h-full overflow-auto px-4 py-3"
        >
          <pre
            className="font-mono text-[12.5px] leading-[1.55] text-green-200/85 whitespace-pre m-0 min-w-0"
            style={{ tabSize: 8 }}
          >
            {loading && !content
              ? "Connecting to iTerm2 session…"
              : content?.content || "(empty terminal)"}
          </pre>
        </div>

        {/* Scroll-to-bottom hint */}
        {!autoScroll && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-3 right-4 px-3 py-1 rounded-full bg-bg-secondary border border-border text-xs text-text-secondary hover:text-text-primary shadow-lg transition-colors"
          >
            ↓ scroll to latest
          </button>
        )}
      </div>

      {/* Command input */}
      <div className="border-t border-border bg-bg-primary px-4 py-3 flex-shrink-0">
        <div className="flex items-end gap-2 bg-bg-secondary border border-border rounded-xl px-3 py-2 focus-within:border-accent/50 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder="Send command to terminal…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none font-mono leading-relaxed"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 p-1.5 rounded-lg text-text-muted hover:text-accent disabled:opacity-30 transition-colors mb-0.5"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-1.5 px-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[10px] text-text-muted font-mono">
            {session.name} · auto-refresh 2s · Enter to send · Shift+Enter for newline
          </span>
        </div>
      </div>
    </div>
  );
}
