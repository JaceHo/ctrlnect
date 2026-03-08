import { defineConfig, createLogger } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// Custom logger that suppresses ECONNREFUSED/ECONNRESET proxy noise during
// server restarts. Vite's built-in proxy error handler logs before our
// configure() callback can intercept, so we must filter at the logger level.
const logger = createLogger();
const originalError = logger.error.bind(logger);
logger.error = (msg, options) => {
  if (
    msg.includes("ECONNREFUSED") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ws proxy error") ||
    msg.includes("ws proxy socket error") ||
    msg.includes("http proxy error")
  ) return;
  originalError(msg, options);
};

export default defineConfig({
  customLogger: logger,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            try { (res as { end: () => void }).end(); } catch { /* ignore */ }
          });
        },
      },
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
        configure: (proxy) => {
          proxy.on("error", () => { /* noop */ });
        },
      },
    },
  },
});
