import { Plus, Terminal } from "lucide-react";
import type { Session, CreateSessionRequest, CronJob, CreateCronRequest, UpdateCronRequest } from "@webclaude/shared";
import { SessionList } from "../session/session-list";
import { CronPanel } from "../cron/cron-panel";
import { ServicePanel } from "../services/service-panel";

import { useState } from "react";
import type { SystemService } from "@/hooks/use-services";

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: (req: CreateSessionRequest) => void;
  onDeleteSession: (id: string) => void;
  crons: CronJob[];
  activeCronId: string | null;
  onSelectCron: (id: string | null) => void;
  onCreateCron: (req: CreateCronRequest) => Promise<CronJob>;
  onUpdateCron: (id: string, req: UpdateCronRequest) => Promise<CronJob>;
  onDeleteCron: (id: string) => Promise<void>;
  onTriggerCron: (id: string) => Promise<void>;
  services: SystemService[];
  onStartService: (id: string) => Promise<boolean>;
  onStopService: (id: string) => Promise<boolean>;
  onRestartService: (id: string) => Promise<boolean>;
  onDeleteService: (id: string) => Promise<boolean>;
  onCreateService: (service: { name: string; description?: string; command: string; cwd?: string; logPath?: string }) => Promise<boolean>;
  onGetServiceLogs: (id: string) => Promise<string>;
  onDiscoverServices: () => Promise<{ name: string; description: string; command: string; logPath?: string }[]>;
}

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  crons,
  activeCronId,
  onSelectCron,
  onCreateCron,
  onUpdateCron,
  onDeleteCron,
  onTriggerCron,
  services,
  onStartService,
  onStopService,
  onRestartService,
  onDeleteService,
  onCreateService,
  onGetServiceLogs,
  onDiscoverServices,
}: SidebarProps) {
  return (
    <>
      <div className="p-3 border-b border-border">
        <button
          onClick={() => onCreateSession({})}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-sm"
        >
          <Plus size={15} />
          New Session
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={onSelectSession}
          onDelete={onDeleteSession}
        />
      </div>
      <CronPanel
        crons={crons}
        sessions={sessions}
        activeCronId={activeCronId}
        onSelectCron={onSelectCron}
        onCreateCron={onCreateCron}
        onUpdateCron={onUpdateCron}
        onDeleteCron={onDeleteCron}
        onTriggerCron={onTriggerCron}
      />
      <ServicePanel
        services={services}
        onStart={onStartService}
        onStop={onStopService}
        onRestart={onRestartService}
        onDelete={onDeleteService}
        onCreate={onCreateService}
        onGetLogs={onGetServiceLogs}
        onDiscover={onDiscoverServices}
      />
      <div className="p-2.5 border-t border-border text-[11px] text-text-muted text-center font-light tracking-wide">
        WebClaude
      </div>
    </>
  );
}
