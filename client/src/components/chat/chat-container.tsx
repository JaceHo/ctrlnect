import { useState, useEffect, useRef } from "react";
import { ArrowDown, ChevronUp, Loader2 } from "lucide-react";
import type { ChatMessage } from "@/hooks/use-chat";
import { ChatMessages } from "./chat-messages";

interface ChatContainerProps {
  messages: ChatMessage[];
  streaming: boolean;
  onLoadMoreHistory?: () => Promise<void>;
}

export function ChatContainer({ messages, streaming, onLoadMoreHistory }: ChatContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const userScrolledUp = useRef(false);

  const scrollToBottom = () => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      userScrolledUp.current = false;
    }
  };

  // Auto-scroll when new messages arrive (if enabled)
  useEffect(() => {
    if (autoScroll && messages.length > 0) {
      requestAnimationFrame(() => {
        setTimeout(scrollToBottom, 50);
      });
    }
  }, [messages, autoScroll]);

  // Track scroll position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      userScrolledUp.current = !atBottom;
      setShowScrollBtn(!atBottom);
    };

    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="text-center space-y-1">
          <p className="text-lg font-light">What can I help you with?</p>
        </div>
      </div>
    );
  }

  const handleLoadMore = async () => {
    if (!onLoadMoreHistory || loadingMore) return;
    setLoadingMore(true);
    try {
      await onLoadMoreHistory();
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto relative" ref={containerRef}>
      <div className="max-w-3xl mx-auto px-6 py-6">
        {onLoadMoreHistory && (
          <div className="flex justify-center mb-4">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted border border-border rounded-full hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
            >
              {loadingMore ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <ChevronUp size={11} />
              )}
              Load older messages
            </button>
          </div>
        )}
        <ChatMessages messages={messages} streaming={streaming} />
      </div>

      {/* Auto-scroll toggle button */}
      <button
        onClick={() => setAutoScroll(!autoScroll)}
        className={`absolute top-3 right-4 px-2 py-1 rounded-md text-[10px] transition-colors ${
          autoScroll
            ? "bg-accent/20 text-accent"
            : "bg-bg-tertiary text-text-muted"
        }`}
        title={autoScroll ? "Auto-scroll ON - click to disable" : "Auto-scroll OFF - click to enable"}
      >
        {autoScroll ? "Follow" : "Paused"}
      </button>

      {/* Scroll to bottom button - show when user scrolled up */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 p-2.5 rounded-full bg-accent text-bg-primary shadow-lg hover:bg-accent-hover transition-all hover:scale-105"
          title="Scroll to bottom"
        >
          <ArrowDown size={16} />
        </button>
      )}
    </div>
  );
}
