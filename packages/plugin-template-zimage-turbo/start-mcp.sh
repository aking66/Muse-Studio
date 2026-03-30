#!/usr/bin/env bash
set -euo pipefail

# Start Z-Image Turbo MCP server using muse_backend shared virtualenv.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PY=""

# Preferred path requested by user: ../muse_backend/.venv (from this package).
if [[ -x "$SCRIPT_DIR/../muse_backend/.venv/bin/python" ]]; then
  VENV_PY="$SCRIPT_DIR/../muse_backend/.venv/bin/python"
fi

# Monorepo layout fallback: ../../muse_backend/.venv (Linux/macOS shell).
if [[ -z "$VENV_PY" && -x "$SCRIPT_DIR/../../muse_backend/.venv/bin/python" ]]; then
  VENV_PY="$SCRIPT_DIR/../../muse_backend/.venv/bin/python"
fi

# Windows venv path fallback when invoked from Git Bash/WSL in this repo.
if [[ -z "$VENV_PY" && -x "$SCRIPT_DIR/../../muse_backend/.venv/Scripts/python.exe" ]]; then
  VENV_PY="$SCRIPT_DIR/../../muse_backend/.venv/Scripts/python.exe"
fi

if [[ -z "$VENV_PY" ]]; then
  echo "[zimage-mcp] ERROR: Could not find python in muse_backend virtualenv." >&2
  echo "[zimage-mcp] Checked:" >&2
  echo "  $SCRIPT_DIR/../muse_backend/.venv/bin/python" >&2
  echo "  $SCRIPT_DIR/../../muse_backend/.venv/bin/python" >&2
  echo "  $SCRIPT_DIR/../../muse_backend/.venv/Scripts/python.exe" >&2
  exit 1
fi

cd "$SCRIPT_DIR"
echo "[zimage-mcp] Using python: $VENV_PY"
echo "[zimage-mcp] Starting: python -m app.mcp_server"
exec "$VENV_PY" -m app.mcp_server "$@"
