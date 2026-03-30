@echo off
setlocal

REM Start Z-Image Turbo MCP server using muse_backend shared virtualenv.
set "SCRIPT_DIR=%~dp0"
set "VENV_PY="

REM Preferred path requested by user: ../muse_backend/.venv (from this package).
if exist "%SCRIPT_DIR%..\muse_backend\.venv\Scripts\python.exe" (
  set "VENV_PY=%SCRIPT_DIR%..\muse_backend\.venv\Scripts\python.exe"
)

REM Monorepo layout fallback: ../../muse_backend/.venv
if not defined VENV_PY if exist "%SCRIPT_DIR%..\..\muse_backend\.venv\Scripts\python.exe" (
  set "VENV_PY=%SCRIPT_DIR%..\..\muse_backend\.venv\Scripts\python.exe"
)

if not defined VENV_PY (
  echo [zimage-mcp] ERROR: Could not find python in muse_backend virtualenv.
  echo [zimage-mcp] Checked:
  echo   %SCRIPT_DIR%..\muse_backend\.venv\Scripts\python.exe
  echo   %SCRIPT_DIR%..\..\muse_backend\.venv\Scripts\python.exe
  exit /b 1
)

cd /d "%SCRIPT_DIR%"
echo [zimage-mcp] Using python: "%VENV_PY%"
echo [zimage-mcp] Starting: python -m app.mcp_server
"%VENV_PY%" -m app.mcp_server %*
set "EXIT_CODE=%ERRORLEVEL%"

endlocal & exit /b %EXIT_CODE%
