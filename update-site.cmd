@echo off
rem Double-click me after editing files in content\ : builds decks + audio, then publishes to GitHub.
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo First run: setting up the build tools...
  python -m venv .venv
  ".venv\Scripts\python.exe" -m pip install -q -r tools\requirements.txt
)
echo Building decks, audio and site data...
".venv\Scripts\python.exe" tools\build.py
if errorlevel 1 (
  echo.
  echo Build failed - see the messages above.
  pause
  exit /b 1
)
git add -A
git commit -m "Weekly update %date%"
git push
echo.
echo Done! The site updates in about a minute.
pause
