import { MessageCircle } from "lucide-react";
import type { Session } from "@ctrlnect/shared";
import { SessionItem } from "./session-item";
import { FeishuIcon } from "@/components/icons/feishu-icon";
import { cn } from "@/lib/utils";

interface SessionListProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  wechatActive?: boolean;
  onSelectWeChat?: () => void;
}

/** Small section label divider */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3 pb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-text-muted font-medium select-none">
      {children}
    </div>
  );
}

export function SessionList({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
  wechatActive,
  onSelectWeChat,
}: SessionListProps) {
  const feishuSessions = sessions.filter((s) => !!s.feishuDmInfo);
  const regularSessions = sessions.filter((s) => !s.feishuDmInfo);

  const renderItem = (session: Session) => (
    <SessionItem
      key={session.id}
      session={session}
      isActive={session.id === activeSessionId}
      onSelect={() => onSelect(session.id)}
      onDelete={() => onDelete(session.id)}
    />
  );

  const hasConnections = feishuSessions.length > 0 || onSelectWeChat;

  return (
    <div className="py-1">
      {/* ── Messaging connections (Feishu DMs + WeChat) ── */}
      {hasConnections && (
        <>
          <SectionLabel>
            <MessageCircle size={10} />
            Connections
          </SectionLabel>

          {/* WeChat entry */}
          {onSelectWeChat && (
            <div
              onClick={onSelectWeChat}
              className={cn(
                "group flex items-start gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors",
                wechatActive ? "bg-bg-tertiary" : "hover:bg-bg-hover",
              )}
            >
              <MessageCircle
                size={13}
                className="mt-[3px] flex-shrink-0 text-green-500"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">WeChat Web</div>
                <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                  <span className="text-green-500">WeChat</span>
                </div>
              </div>
            </div>
          )}

          {/* Feishu DM sessions */}
          {feishuSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onSelect={() => onSelect(session.id)}
              onDelete={() => onDelete(session.id)}
            />
          ))}
        </>
      )}

      {/* ── Regular Claude sessions ── */}
      {regularSessions.length > 0 && (
        <>
          {hasConnections && <SectionLabel>Sessions</SectionLabel>}
          {regularSessions.map(renderItem)}
        </>
      )}

      {sessions.length === 0 && !onSelectWeChat && (
        <div className="p-4 text-center text-text-muted text-sm">
          No sessions yet
        </div>
      )}
    </div>
  );
}
