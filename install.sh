#!/usr/bin/env bash
set -euo pipefail

APP_NAME="codex-whatsapp"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/codex-whatsapp}"
REPO_RAW_BASE="${REPO_RAW_BASE:-https://raw.githubusercontent.com/BenjaminRM10/codex-whatsapp-bridge/main}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need curl
need node

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js >=20 is required. Current: $(node --version)" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"

echo "Installing $APP_NAME into $INSTALL_DIR/$APP_NAME"
curl -fsSL "$REPO_RAW_BASE/bin/codex-whatsapp.js" -o "$INSTALL_DIR/$APP_NAME"
chmod +x "$INSTALL_DIR/$APP_NAME"

if [ ! -f "$CONFIG_DIR/.env" ]; then
  cat > "$CONFIG_DIR/.env" <<EOF
EASYHOOK_API_KEY=
EASYHOOK_FROM=
ALLOWED_USERS=
PORT=8787
HOST=127.0.0.1
TUNNEL=auto
NOTIFY_ON_START=0
DEFAULT_CWD=$PWD
WEBHOOK_BEARER_SECRET=
CODEX_BIN=codex
CODEX_USE_PTY=1
EOF
  echo "Created config: $CONFIG_DIR/.env"
else
  echo "Keeping existing config: $CONFIG_DIR/.env"
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "Warning: codex was not found in PATH. Set CODEX_BIN in $CONFIG_DIR/.env if needed." >&2
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Warning: cloudflared was not found. Install Cloudflare Tunnel before running codex-whatsapp start." >&2
fi

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo
    echo "Add this to your shell profile if codex-whatsapp is not found:"
    echo "export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac

echo
if [ "${SKIP_SETUP:-0}" = "1" ]; then
  echo "Edit config:"
  echo "  $CONFIG_DIR/.env"
  echo
  echo "Start:"
  echo "  $APP_NAME start"
else
  echo "Starting onboarding..."
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    CODEX_WHATSAPP_CONFIG_DIR="$CONFIG_DIR" "$INSTALL_DIR/$APP_NAME" setup </dev/tty >/dev/tty
  else
    echo "No interactive terminal detected. Run this after install:"
    echo "  $APP_NAME setup"
  fi
fi
