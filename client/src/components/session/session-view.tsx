import { useState } from "react";
import { useChat } from "../../hooks/use-chat";
import { Header } from "../layout/header";
import { ChatContainer } from "../chat/chat-container";
import { ChatInput } from "../input/chat-input";
import { TaskManagerDialog } from "../chat/task-manager-dialog";
import type { Session, UpdateSessionRequest } from "@ctrlnect/shared";
import { API_BASE } from "../../api";

interface SessionViewProps {
  sessionId: string;
  session: Session | null;
  onUpdateSession: (id: string, req: UpdateSessionRequest) => Promise<Session>;
}

/**
 * A single mounted session tab — owns its own useChat state so messages/streaming
 * are preserved when switching to other tabs and back.
 */
export function SessionView({ sessionId, session, onUpdateSession }: SessionViewProps) {
  const {
    messages,
    streaming,
    sendMessage,
    interrupt,
    subTasks,
    addSubTask,
    interruptSubTask,
    retrySubTask,
    reloadMessages,
  } = useChat(sessionId);

  const [showTaskManager, setShowTaskManager] = useState(false);

  const handleModelChange = async (model: string) => {
    await onUpdateSession(sessionId, { model });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Header
        session={session}
        onModelChange={handleModelChange}
        onShowTaskManager={() => setShowTaskManager(true)}
        hasSubTasks={subTasks.length > 0}
      />

      {session ? (
        <>
          <ChatContainer
            messages={messages}
            streaming={streaming}
            onLoadMoreHistory={
              session.feishuDmInfo
                ? async () => {
                    const earliestTs = messages[0]?.timestamp
                      ? new Date(messages[0].timestamp).getTime()
                      : Date.now();
                    await fetch(
                      `${API_BASE}/api/feishu/session/${sessionId}/history?before_time=${earliestTs - 1}`,
                    );
                    await reloadMessages();
                  }
                : undefined
            }
          />
          <ChatInput
            onSend={sendMessage}
            onInterrupt={interrupt}
            streaming={streaming}
            disabled={false}
          />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-text-muted">
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-light">CtrlNect</h2>
            <p className="text-sm">Loading session…</p>
          </div>
        </div>
      )}

      {showTaskManager && (
        <TaskManagerDialog
          subTasks={subTasks}
          onInterruptTask={interruptSubTask}
          onRetryTask={retrySubTask}
          onAddTask={addSubTask}
          onClose={() => setShowTaskManager(false)}
        />
      )}
    </div>
  );
}
