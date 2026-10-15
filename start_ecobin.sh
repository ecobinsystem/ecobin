#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ -d "$DIR/.venv" ]; then
    source "$DIR/.venv/bin/activate"
elif [ -d "/home/ecobin/ecobin/.venv" ]; then
    source "/home/ecobin/ecobin/.venv/bin/activate"
fi

python ecobin_server.py &
SERVER_PID=$!

sleep 3

if command -v libcamerify >/dev/null 2>&1; then
    libcamerify python camera_ecobin.py &
else
    python camera_ecobin.py &
fi
CAM_PID=$!

cleanup() {
    kill "$SERVER_PID" "$CAM_PID" 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

wait -n "$SERVER_PID" "$CAM_PID"
cleanup
