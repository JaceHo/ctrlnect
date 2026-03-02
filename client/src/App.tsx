import { useState, useCallback } from "react";
import { WSProvider } from "./hooks/use-websocket";
import { useSessions } from "./hooks/use-sessions";
import { useChat } from "./hooks/use-chat";
import { AppLayout } from "./components/layout/app-layout";
import { Sidebar } from "./components/layout/sidebar";
import { Header } from "./components/layout/header";
import { ChatContainer } from "./components/chat/chat-container";
import { ChatInput } from "./components/input/chat-input";
import type { CreateSessionRequest } from "@webclaude/shared";

function AppInner() {
  const { sessions, createSession, updateSession, deleteSession } =
    useSessions();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  const { messages, streaming, sendMessage, interrupt } =
    useChat(activeSessionId);

  const handleCreateSession = useCallback(
    async (req: CreateSessionRequest) => {
      const session = await createSession(req);
      setActiveSessionId(session.id);
    },
    [createSession],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      if (activeSessionId === id) {
        setActiveSessionId(null);
      }
    },
    [deleteSession, activeSessionId],
  );

  const handleModelChange = useCallback(
    async (model: string) => {
      if (!activeSessionId) return;
      await updateSession(activeSessionId, { model });
    },
    [activeSessionId, updateSession],
  );

  return (
    <AppLayout
      sidebar={
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onCreateSession={handleCreateSession}
          onDeleteSession={handleDeleteSession}
        />
      }
    >
      <Header session={activeSession} onModelChange={handleModelChange} />

      {activeSession ? (
        <>
          <ChatContainer messages={messages} streaming={streaming} />
          <ChatInput
            onSend={sendMessage}
            onInterrupt={interrupt}
            streaming={streaming}
            disabled={!activeSessionId}
          />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-text-muted">
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-light">WebClaude</h2>
            <p className="text-sm">
              Create a new session or select an existing one
            </p>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

export function App() {
  return (
    <WSProvider>
      <AppInner />
    </WSProvider>
  );
}
