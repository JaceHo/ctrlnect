import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { WSClient } from "@/lib/ws-client";
import type { ServerMessage } from "@ctrlnect/shared";

const WSContext = createContext<WSClient | null>(null);

// Singleton - created once, survives HMR and StrictMode
let globalClient: WSClient | null = null;
function getClient(): WSClient {
  if (!globalClient) {
    globalClient = new WSClient();
    globalClient.connect();
  }
  return globalClient;
}

export function WSProvider({ children }: { children: ReactNode }) {
  const client = getClient();

  return <WSContext.Provider value={client}>{children}</WSContext.Provider>;
}

export function useWS(): WSClient {
  const client = useContext(WSContext);
  if (!client) throw new Error("useWS must be used within WSProvider");
  return client;
}

export function useWSListener(handler: (msg: ServerMessage) => void) {
  const ws = useWS();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const fn = (msg: ServerMessage) => handlerRef.current(msg);
    return ws.on(fn);
  }, [ws]);
}
