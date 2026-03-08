import { ExternalLink, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";

const WECHAT_URL = "https://wx.qq.com/";

export function WeChatView() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [key, setKey] = useState(0);

  const handleRefresh = () => setKey((k) => k + 1);

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Header */}
      <header className="h-11 border-b border-border bg-bg-primary flex items-center px-4 gap-3 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
        <span className="text-sm font-medium text-text-primary">WeChat Web</span>
        <span className="text-xs text-text-muted font-mono flex-1 truncate">{WECHAT_URL}</span>
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          title="Reload"
        >
          <RefreshCw size={14} />
        </button>
        <a
          href={WECHAT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          title="Open in browser"
        >
          <ExternalLink size={14} />
        </a>
      </header>

      {/* Iframe */}
      <div className="flex-1 relative min-h-0">
        <iframe
          key={key}
          ref={iframeRef}
          src={WECHAT_URL}
          className="w-full h-full border-0"
          title="WeChat Web"
          allow="clipboard-read; clipboard-write; microphone; camera"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
        />
        {/* Overlay hint — shown only if iframe fails to render (X-Frame-Options) */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none"
          style={{ display: "none" }}
          id="wechat-blocked-hint"
        >
          <p className="text-sm text-text-muted text-center">
            WeChat Web blocks embedding via X-Frame-Options.<br />
            Use the <strong>Open in Browser</strong> button above instead.
          </p>
        </div>
      </div>
    </div>
  );
}
