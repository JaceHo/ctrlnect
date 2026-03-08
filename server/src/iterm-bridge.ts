import { join } from "path";

export const ITERM_BRIDGE_PORT = parseInt(process.env.ITERM_BRIDGE_PORT || "8765");
const SCRIPT = join(import.meta.dir, "..", "iterm_bridge.py");
const RESTART_DELAY_MS = 3000;
const MAX_RESTARTS = 5;

let proc: ReturnType<typeof Bun.spawn> | null = null;
let restartCount = 0;
let stopping = false;

function log(msg: string) {
  console.log(`[iTerm Bridge] ${msg}`);
}

async function waitReady(timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${ITERM_BRIDGE_PORT}/sessions`, {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) return true;
    } catch {}
    await Bun.sleep(300);
  }
  return false;
}

export async function startItermBridge(): Promise<void> {
  stopping = false;
  restartCount = 0;
  await spawnBridge();
}

async function spawnBridge() {
  if (stopping) return;

  log("Starting iterm_bridge.py…");
  proc = Bun.spawn(["uv", "run", SCRIPT], {
    env: { ...process.env, ITERM_BRIDGE_PORT: String(ITERM_BRIDGE_PORT) },
    stdout: "pipe",
    stderr: "pipe",
  });

  // Forward bridge stdout/stderr with prefix
  const stdout = proc!.stdout as ReadableStream<Uint8Array>;
  const stderr = proc!.stderr as ReadableStream<Uint8Array>;

  (async () => {
    const reader = stdout.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      process.stdout.write(dec.decode(value));
    }
  })().catch(() => {});

  (async () => {
    const reader = stderr.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      process.stderr.write(dec.decode(value));
    }
  })().catch(() => {});

  const ready = await waitReady();
  if (ready) {
    log(`Ready on :${ITERM_BRIDGE_PORT}`);
    restartCount = 0;
  } else {
    log("Warning: bridge did not become ready in time");
  }

  // Watch for unexpected exit and auto-restart
  proc.exited.then((code) => {
    if (stopping) return;
    log(`Exited (code ${code})`);
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      log(`Restarting in ${RESTART_DELAY_MS}ms (attempt ${restartCount}/${MAX_RESTARTS})…`);
      setTimeout(spawnBridge, RESTART_DELAY_MS);
    } else {
      log("Max restarts reached — iTerm2 panel will show as offline");
    }
  });
}

export function stopItermBridge() {
  stopping = true;
  if (proc) {
    proc.kill();
    proc = null;
    log("Stopped");
  }
}

/** Fetch wrapper — proxies a request to the internal bridge */
export async function bridgeFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${ITERM_BRIDGE_PORT}${path}`, init);
}
