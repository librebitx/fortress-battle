#!/bin/bash

# Define paths relative to the script location
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
BACKEND_DIR="$SCRIPT_DIR/tetris-shared"
FRONTEND_DIR="$SCRIPT_DIR/tetris-vue"

# Function to check port usage
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        return 0 # Port is in use
    else
        return 1 # Port is free
    fi
}

echo "=== Starting Multiplayer Tetris ==="

# Check if ports are already in use
if check_port 3000; then
    echo "Warning: Port 3000 (Backend) is already in use."
    read -p "Do you want to stop the existing process? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        fuser -k 3000/tcp
        echo "Stopped process on port 3000."
    else
        echo "Aborting startup."
        exit 1
    fi
fi

if check_port 5173; then
    echo "Warning: Port 5173 (Frontend) is already in use."
    read -p "Do you want to stop the existing process? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        fuser -k 5173/tcp
        echo "Stopped process on port 5173."
    else
        # Vite might pick next port, but let's be clean
        echo "Proceeding, but frontend port might change."
    fi
fi

# Start Backend
echo "Starting Backend Server..."
cd "$BACKEND_DIR"
nohup node server.js > server.log 2>&1 &
BACKEND_PID=$!
echo "Backend started with PID $BACKEND_PID (Logs: tetris-shared/server.log)"

# Start Frontend
echo "Starting Vue Frontend..."
cd "$FRONTEND_DIR"
nohup npm run dev -- --host > vue.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started with PID $FRONTEND_PID (Logs: tetris-vue/vue.log)"

echo "=== Game Started ==="
echo "Backend running at: http://localhost:3000"
echo "Frontend running at: http://localhost:5173"
echo "To stop the game, run ./stop_game.sh"
