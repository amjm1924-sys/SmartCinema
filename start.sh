#!/usr/bin/env bash
echo "==================================================="
echo "  SmartCinema - Full Stack Launcher"
echo "==================================================="

# Start Backend
echo "[*] Starting Backend Server..."
(cd backend && python3 app.py) &
BACKEND_PID=$!

sleep 2

# Start Frontend
echo "[*] Starting Frontend Server..."
(cd frontend && npm run dev) &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait
