@echo off
REM TalkPupils — start the local server and open Chrome.
REM Needs Python 3 (free from https://www.python.org/downloads/) and Google Chrome.
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo  Python 3 was not found on this laptop.
  echo  Please install Python 3 from https://www.python.org/downloads/
  echo  (tick "Add Python to PATH" during the install), then run start.bat again.
  echo.
  pause
  exit /b 1
)
echo Starting the practice app server...
start "Practice App Server" python server.py
REM Give the server a moment to start, then open the app in Chrome.
timeout /t 2 /nobreak >nul
start "" "http://localhost:8080"
echo.
echo The app is running at http://localhost:8080
echo (If 8080 was busy, the server picks the next free port up to 8090 -
echo  check the address printed in the "Practice App Server" window.)
echo Close the "Practice App Server" window to stop the app.
echo.
pause
