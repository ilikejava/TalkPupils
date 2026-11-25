#!/bin/sh
# TalkPupils — start the local server and open the browser.
# Needs Python 3 and Google Chrome (for microphone and speech).
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 was not found on this computer."
  echo "Please install Python 3 (https://www.python.org/downloads/), then run start.sh again."
  exit 1
fi
python3 server.py &
SERVER_PID=$!
sleep 2
# Open the app in the default browser (Chrome is best for microphone + speech).
if command -v open >/dev/null 2>&1; then
  open "http://localhost:8080"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:8080"
fi
echo "The app is running at http://localhost:8080"
echo "(If 8080 was busy, the server picks the next free port up to 8090.)"
echo "Press Ctrl+C to stop the server."
wait $SERVER_PID
