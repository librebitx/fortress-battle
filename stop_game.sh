#!/bin/bash

echo "=== Stopping Multiplayer Tetris ==="

# Find and kill the backend node process running server.js
# We use pgrep with -f to match the full command line
pkill -f "node server.js"
if [ $? -eq 0 ]; then
    echo "Backend server stopped."
else
    echo "Backend server was not running or not found."
fi

# Find and kill the vite dev server
pkill -f "vite"
if [ $? -eq 0 ]; then
    echo "Frontend server stopped."
else
    echo "Frontend server was not running or not found."
fi

echo "=== All Services Stopped ==="
