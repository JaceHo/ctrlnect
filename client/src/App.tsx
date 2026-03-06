import { useState, useCallback, useEffect } from "react";
import { WSProvider } from "./hooks/use-websocket";
import { useSessions } from "./hooks/use-sessions";
import { useChat } from "./hooks/use-chat";
import { useCrons } from "./hooks/use-crons";
import { useServices } from "./hooks/use-services";
import { AppLayout } from "./components/layout/app-layout";
import { Sidebar } from "./components/layout/sidebar";
import { Header } from "./components/layout/header";
import { ChatContainer } from "./components/chat/chat-container";
import { ChatInput } from "./components/input/chat-input";
import { TaskManagerDialog } from "./components/chat/task-manager-dialog";
import { CronLogView } from "./components/cron/cron-log-view";
import type { CreateSessionRequest } from "@webclaude/shared";

const STORAGE_KEY = "webclaude_active_session_id";

function AppInner() {
  const { sessions, loading, createSession, updateSession, deleteSession } =
    useSessions();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  const { messages, streaming, sendMessage, interrupt, subTasks, addSubTask, interruptSubTask, retrySubTask } =
    useChat(activeSessionId);
  const { crons, createCron, updateCron, deleteCron, triggerCron } = useCrons();
  const [activeCronId, setActiveCronId] = useState<string | null>(null);
  const activeCron = crons.find((c) => c.id === activeCronId) || null;
  const [showTaskManager, setShowTaskManager] = useState(false);
  const { services, createService, deleteService, startService, stopService, restartService, getServiceLogs, discoverServices } = useServices();

  // Initialize session - runs when sessions finish loading
  useEffect(() => {
    console.log("[App] Effect run: loading=", loading, "sessions=", sessions.length, "hasActive=", !!activeSessionId);

    // Skip if still loading or already have active session
    if (loading || activeSessionId) return;

    // Skip if no sessions
    if (sessions.length === 0) {
      createSession({}).then((session) => {
        console.log("[App] Created new session:", session.id);
        setActiveSessionId(session.id);
      });
      return;
    }

    // Try to restore saved session
    const savedSessionId = localStorage.getItem(STORAGE_KEY);
    console.log("[App] savedSessionId=", savedSessionId, "sessions=", sessions.map(s => s.id));

    if (savedSessionId && sessions.some((s) => s.id === savedSessionId)) {
      console.log("[App] Restoring saved session:", savedSessionId);
      setActiveSessionId(savedSessionId);
      return;
    }

    // Default: use first session
    console.log("[App] Using first session:", sessions[0].id);
    setActiveSessionId(sessions[0].id);
  }, [sessions, loading, createSession, activeSessionId]);

  // Persist active session to localStorage
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem(STORAGE_KEY, activeSessionId);
    }
  }, [activeSessionId]);

  const handleSelectSession = useCallback(
    (id: string) => {
      setActiveSessionId(id);
      setActiveCronId(null);
    },
    [],
  );

  const handleSelectCron = useCallback(
    (id: string | null) => {
      setActiveCronId(id);
    },
    [],
  );

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
        // Select another session or create new one
        const remaining = sessions.filter((s) => s.id !== id);
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id);
        } else {
          const newSession = await createSession({});
          setActiveSessionId(newSession.id);
        }
      }
    },
    [deleteSession, activeSessionId, sessions, createSession],
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
          onSelectSession={handleSelectSession}
          onCreateSession={handleCreateSession}
          onDeleteSession={handleDeleteSession}
          crons={crons}
          activeCronId={activeCronId}
          onSelectCron={handleSelectCron}
          onCreateCron={createCron}
          onUpdateCron={updateCron}
          onDeleteCron={deleteCron}
          onTriggerCron={triggerCron}
          services={services}
          onStartService={startService}
          onStopService={stopService}
          onRestartService={restartService}
          onDeleteService={deleteService}
          onCreateService={createService}
          onGetServiceLogs={getServiceLogs}
          onDiscoverServices={discoverServices}
        />
      }
    >
      {activeCron ? (
        <CronLogView
          cron={activeCron}
          sessions={sessions}
          onBack={() => setActiveCronId(null)}
          onTrigger={triggerCron}
        />
      ) : (
        <>
          <Header
            session={activeSession}
            onModelChange={handleModelChange}
            onShowTaskManager={() => setShowTaskManager(true)}
            hasSubTasks={subTasks.length > 0}
          />

          {activeSession ? (
            <>
              <ChatContainer
                messages={messages}
                streaming={streaming}
              />
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
        </>
      )}

      {/* Task Manager Dialog */}
      {showTaskManager && (
        <TaskManagerDialog
          subTasks={subTasks}
          onInterruptTask={interruptSubTask}
          onRetryTask={retrySubTask}
          onAddTask={addSubTask}
          onClose={() => setShowTaskManager(false)}
        />
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
