#!/bin/bash

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Control file for commands
CONTROL_FILE="$SCRIPT_DIR/.dev.sh.control"

# Timestamped logging
log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"
}

log_info() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} ${CYAN}[INFO]${NC} $*"
}

log_success() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} ${GREEN}[OK]${NC} $*"
}

log_warn() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} ${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} ${RED}[ERROR]${NC} $*"
}

log_action() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} ${MAGENTA}[ACTION]${NC} $*"
}

log_hmr() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} ${YELLOW}[HMR]${NC} $*"
}

# Process IDs
SERVER_PID=""
CLIENT_PID=""

# Kill existing processes
kill_existing() {
    log_info "Killing existing processes..."

    # Kill by port
    lsof -ti :3001 | xargs kill -9 2>/dev/null
    lsof -ti :5173 | xargs kill -9 2>/dev/null

    # Kill bun processes related to this project
    pkill -f "webclaude" 2>/dev/null
    pkill -f "vite" 2>/dev/null
    pkill -f "bun run.*server" 2>/dev/null
    pkill -f "bun run.*client" 2>/dev/null

    sleep 1
    log_success "Existing processes killed"
}

# Start server
start_server() {
    log_info "Starting server (port 3001)..."
    bun run --watch server/src/index.ts 2>&1 | while IFS= read -r line; do
        log "[SERVER] $line"
    done &
    SERVER_PID=$!
    log_success "Server started (PID: $SERVER_PID)"
}

# Start client
start_client() {
    log_info "Starting client (port 5173)..."
    cd "$SCRIPT_DIR/client" && bunx vite 2>&1 | while IFS= read -r line; do
        # Highlight HMR updates
        if echo "$line" | grep -q "hmr update"; then
            log_hmr "$line"
        elif echo "$line" | grep -qE "(error|Error|ERROR)"; then
            log_error "$line"
        else
            log "[CLIENT] $line"
        fi
    done &
    CLIENT_PID=$!
    log_success "Client started (PID: $CLIENT_PID)"
}

# Refresh client (restart Vite)
refresh_client() {
    log_action "Refreshing client (restarting Vite)..."
    if [ -n "$CLIENT_PID" ]; then
        kill $CLIENT_PID 2>/dev/null
        sleep 0.5
    fi
    # Kill any remaining vite processes
    pkill -f "vite" 2>/dev/null
    sleep 1
    start_client
    log_success "Client refreshed"
}

# Restart server
restart_server() {
    log_action "Restarting server..."
    if [ -n "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null
        sleep 0.5
    fi
    # Kill any remaining server processes
    pkill -f "bun run.*server" 2>/dev/null
    sleep 1
    start_server
    log_success "Server restarted"
}

# Cleanup on exit
cleanup() {
    log_warn "Shutting down..."
    kill $SERVER_PID 2>/dev/null
    kill $CLIENT_PID 2>/dev/null
    pkill -f "vite" 2>/dev/null
    pkill -f "bun run.*server" 2>/dev/null
    rm -f "$CONTROL_FILE"
    log_success "Goodbye!"
    exit 0
}

# Check for commands via control file
check_control_file() {
    if [ -f "$CONTROL_FILE" ]; then
        local cmd=$(cat "$CONTROL_FILE")
        rm -f "$CONTROL_FILE"

        case "$cmd" in
            r|refresh)
                refresh_client
                ;;
            R|restart)
                restart_server
                ;;
            q|quit|exit)
                cleanup
                ;;
        esac
    fi
}

# Setup signal handlers
trap cleanup SIGINT SIGTERM

# Main
kill_existing

# Remove old control file
rm -f "$CONTROL_FILE"

start_server
start_client

echo ""
echo "========================================"
echo -e "${GREEN}Dev server running!${NC}"
echo "========================================"
echo -e "  ${YELLOW}r${NC} - Refresh client (restart Vite)"
echo -e "  ${YELLOW}R${NC} - Restart server"
echo -e "  ${YELLOW}q${NC} - Quit"
echo ""
echo -e "Or use control file: echo r > .dev.sh.control"
echo "========================================"
echo ""

# Check if we have a TTY
if [ -t 0 ]; then
    log_info "Terminal detected - keyboard shortcuts enabled"
    # Keyboard listener using stty
    stty -echo -icanon time 0 min 0
    while true; do
        check_control_file
        key=$(dd bs=1 count=1 2>/dev/null | tr -d '\n\r')
        case "$key" in
            r)
                refresh_client
                ;;
            R)
                restart_server
                ;;
            q)
                cleanup
                ;;
        esac
        sleep 0.1
    done
else
    log_warn "No terminal - keyboard shortcuts disabled"
    echo ""
    log_info "Use control file to send commands:"
    echo "  echo r > .dev.sh.control   # Refresh client"
    echo "  echo R > .dev.sh.control  # Restart server"
    echo "  echo q > .dev.sh.control  # Quit"
    echo ""
    # Poll for control file commands
    while true; do
        check_control_file
        sleep 1
    done
fi
