<div align="center">

# WebClaude

**A self-hosted web UI for running Claude as an autonomous coding agent — powered by the official [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk).**

Run multiple Claude agent sessions in your browser. Each session gets full access to tools like Read, Write, Edit, Bash, Grep, Glob, WebSearch — the same capabilities as Claude Code, but in a persistent web interface you can access from anywhere.

[Quick Start](#quick-start) · [Features](#features) · [Architecture](#architecture) · [Configuration](#configuration) · [Contributing](#contributing)

</div>

---

## Why WebClaude?

Claude Code is powerful, but it's a CLI tool tied to a single terminal session. WebClaude gives you:

- **Multi-session management** — Run multiple Claude agent sessions simultaneously, switch between them instantly
- **Persistent history** — Sessions and messages survive page refreshes and server restarts
- **Real-time streaming** — Watch Claude think, write code, and use tools as it happens
- **Remote access** — Access your coding agent from any device on your network
- **Full tool access** — Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch, Agent, NotebookEdit — all built-in
- **Zero config** — Uses your existing Anthropic API key or Claude subscription

## Quick Start

**Prerequisites:** [Bun](https://bun.sh) v1.1+

```bash
# Clone
git clone https://github.com/JaceHo/webclaude.git
cd webclaude

# Install
bun install

# Set your API key (or use existing ANTHROPIC_AUTH_TOKEN from ~/.zshrc)
export ANTHROPIC_API_KEY=sk-ant-...

# Run
bun run dev
```

Open **http://localhost:5173** — create a session and start chatting.

## Features

### Multi-Session Agent Management
Create, switch between, and manage multiple concurrent Claude agent sessions. Each session maintains its own conversation history, working directory, and model selection.

### Built-in Tool Support
Every session has access to the full Claude Code toolset:

| Tool | Description |
|------|-------------|
| `Read` | Read files from the filesystem |
| `Write` | Create new files |
| `Edit` | Make targeted edits to existing files |
| `Bash` | Execute shell commands |
| `Grep` | Search file contents with regex |
| `Glob` | Find files by pattern |
| `WebSearch` | Search the web |
| `WebFetch` | Fetch and process web pages |
| `Agent` | Spawn sub-agents for parallel work |
| `NotebookEdit` | Edit Jupyter notebooks |

### Real-time Streaming
Messages stream token-by-token as Claude generates them. Thinking blocks, tool invocations, and tool results all render in real time.

### Model Switching
Switch between Claude models on the fly — per session:
- **Sonnet 4.6** — Fast and capable (default)
- **Opus 4.6** — Most capable
- **Haiku 4.5** — Fastest and cheapest

### Rich Message Rendering
- Markdown with GitHub-flavored extensions
- Syntax-highlighted code blocks (150+ languages)
- Collapsible thinking blocks
- Tool invocation & result visualization
- Inline image display
- Cost tracking per session

### Image Input
Paste images from clipboard, drag-and-drop files, or use the file picker. Images are sent to Claude for visual analysis and coding tasks.

### Persistent Storage
Sessions and message history are saved to disk (`data/sessions.json` + `data/messages/{id}.json`). Close your browser, restart the server — everything is still there when you come back.

### Resilient Agent Runner
If the Claude Code subprocess crashes, WebClaude automatically retries up to 3 times with exponential backoff. Each retry uses a fresh SDK session and falls back to a simpler prompt mode. Non-retryable errors (auth, permissions) fail immediately. Sessions auto-recover to idle after errors so you can send new queries without refreshing.

## Architecture

```
Browser (React + Vite)          Server (Bun + Hono)          Claude Agent SDK
┌─────────────────────┐    WS   ┌──────────────────┐    stdio  ┌─────────────┐
│  Session Manager     │◄──────►│  WS Handler      │          │  Claude Code │
│  Chat UI (streaming) │        │  Connection Mgr   │◄────────►│  Subprocess  │
│  Tool Visualization  │  REST  │  Agent Runner     │          │  (per query) │
│  Model Selector      │◄──────►│  Session Store    │          └─────────────┘
│  Image Upload        │        │  Message Store    │               │
└─────────────────────┘        └──────────────────┘               ▼
                                                            Anthropic API
```

**Monorepo structure:**

```
webclaude/
├── client/          # React 19 + Vite 6 + Tailwind CSS 4
├── server/          # Bun + Hono + Claude Agent SDK
├── shared/          # TypeScript types shared between client & server
└── data/            # Session & message persistence (gitignored)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Frontend | React 19, Vite 6, Tailwind CSS 4, TypeScript |
| Backend | [Hono](https://hono.dev) (REST + WebSocket) |
| Agent | [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) |
| Rendering | react-markdown, remark-gfm, highlight.js |
| Storage | JSON files (no database required) |

### How It Works

1. **User sends a message** via the browser
2. **WebSocket** carries it to the Hono server
3. **Agent Runner** calls `query()` from the Claude Agent SDK, spawning a Claude Code subprocess
4. **SDK events stream** back through WebSocket to the browser in real-time
5. **Messages are persisted** to JSON files on disk
6. **Session state** is broadcast to all connected clients

The Agent SDK manages the full Claude Code subprocess lifecycle — tool execution, multi-turn conversation, permission handling — so WebClaude just needs to relay events.

## Configuration

### API Provider

WebClaude supports two API providers. It auto-detects from your shell environment variables:

**Priority chain:**
1. **Anthropic** (default) — if `ANTHROPIC_API_KEY` is set
2. **OpenAI-compatible** (fallback) — if only `OPENAI_API_KEY` is set

If no base URL is set, the provider's official endpoint is used automatically.

### Environment Variables

```bash
# Option 1: Anthropic (default)
export ANTHROPIC_API_KEY="sk-ant-..."
export ANTHROPIC_BASE_URL="https://api.anthropic.com"  # optional

# Option 2: OpenAI-compatible API
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://api.openai.com/v1"     # optional
```

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key (`sk-ant-...`) |
| `ANTHROPIC_AUTH_TOKEN` | Yes* | Or Claude subscription token (`cr_...`) |
| `ANTHROPIC_BASE_URL` | No | Custom Anthropic-compatible endpoint |
| `OPENAI_API_KEY` | No | OpenAI API key (used if no Anthropic key set) |
| `OPENAI_BASE_URL` | No | Custom OpenAI-compatible endpoint |
| `PORT` | No | Server port (default: `3001`) |

*One of `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, or `OPENAI_API_KEY` is required. The server reads from your shell environment (`~/.zshrc` / `~/.bashrc`) automatically.

### UI Toggle

The header shows the active provider as a badge (`Anthropic` / `OpenAI`). Click it to switch at runtime — takes effect for new agent runs. Green = API key detected, red = missing.

### Proxy Support

Point `ANTHROPIC_BASE_URL` or `OPENAI_BASE_URL` to any compatible proxy (LiteLLM, OpenRouter, custom gateway).

### Default Working Directory

New sessions default to the `webclaude/` project directory. Change the working directory per session in the create dialog.

### Permissions

WebClaude runs with `bypassPermissions` mode — Claude has full tool access without interactive confirmation prompts. This is by design for a self-hosted tool where you control the environment. **Do not expose WebClaude to untrusted networks.**

### Running from Claude Code

If you start the server from within a Claude Code session, WebClaude automatically strips the `CLAUDECODE` environment variable so the Agent SDK subprocess doesn't conflict with the parent session.

## Development

```bash
# Start both servers (backend + Vite dev server)
bun run dev

# Or start individually:
bun run dev:server    # Backend on :3001 (auto-restart on changes)
bun run dev:client    # Vite on :5173 (HMR, proxies to :3001)

# Type check
bun run typecheck

# Build for production
bun run build
```

### API

**REST endpoints:**

```
GET    /api/sessions              # List sessions
POST   /api/sessions              # Create session
PATCH  /api/sessions/:id          # Update session
DELETE /api/sessions/:id          # Delete session + messages
GET    /api/sessions/:id/messages # Get message history
GET    /api/models                # Available models
GET    /health                    # Health check
```

**WebSocket protocol (`/ws`):**

```
→ { type: "subscribe",   sessionId }
→ { type: "chat",        sessionId, text, images? }
→ { type: "interrupt",   sessionId }

← { type: "stream_start", sessionId }
← { type: "agent_event",  sessionId, event }  // SDK events
← { type: "stream_end",   sessionId, cost? }
← { type: "session_update", session }
← { type: "error",        sessionId, message }
```

## Contributing

Contributions are welcome! Areas that could use help:

- [ ] Light theme / theme switching
- [ ] Session search and filtering
- [ ] Export conversations (Markdown, JSON)
- [ ] MCP server configuration UI
- [ ] Docker deployment
- [ ] Multi-user support with auth
- [ ] File tree / workspace explorer
- [ ] Diff viewer for Edit tool results
- [ ] Voice input/output
- [ ] Mobile-optimized layout

Please open an issue first to discuss significant changes.

## License

[MIT](LICENSE)

---

<div align="center">

Built with the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)

</div>
