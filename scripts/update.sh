#!/usr/bin/env bash
# VPS Guardian — Update Script
#
# Pulls the latest code from the git remote, rebuilds, and restarts
# any running scheduled jobs cleanly.
#
# Usage (run as root on your VPS):
#   bash scripts/update.sh
#
# Options:
#   --install-dir <path>   Where guardian is installed (default: /opt/vps-guardian)
#   --branch <name>        Branch to pull (default: main)

set -euo pipefail

INSTALL_DIR="/opt/vps-guardian"
BRANCH="main"

while [[ $# -gt 0 ]]; do
  case $1 in
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --branch)      BRANCH="$2";      shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------

if [ -t 1 ]; then
  GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
  BOLD='\033[1m';     RESET='\033[0m'
else
  GREEN=''; YELLOW=''; RED=''; BOLD=''; RESET=''
fi

info()    { echo -e "${GREEN}[INFO]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"; }

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

section "Pre-flight checks"

if [ "$EUID" -ne 0 ]; then
  error "This script must be run as root. Try: sudo bash scripts/update.sh"
fi

if [ ! -d "$INSTALL_DIR/.git" ]; then
  error "No git repository found at $INSTALL_DIR. Is guardian installed there?"
fi

# Attempt to discover node/npm in common locations (e.g. NVM) if not in PATH (common when running under sudo)
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  for dir in "$HOME" "/root" "/home"/*; do
    if [ -d "$dir/.nvm/versions/node" ]; then
      nvm_bin=$(find "$dir/.nvm/versions/node" -maxdepth 2 -type d -name "bin" 2>/dev/null | sort -V | tail -n 1 || true)
      if [ -n "$nvm_bin" ] && [ -x "$nvm_bin/node" ]; then
        export PATH="$nvm_bin:$PATH"
        break
      fi
    fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  error "Node.js is not found in PATH.\nIf Node.js is installed under a specific user (e.g. via NVM), try running: sudo -E bash $0\nor ensure Node.js is available in root's PATH."
fi

if ! command -v npm >/dev/null 2>&1; then
  error "npm is not found in PATH.\nIf npm is installed under a specific user (e.g. via NVM), try running: sudo -E bash $0\nor ensure npm is available in root's PATH."
fi

info "Install dir: $INSTALL_DIR"

# ---------------------------------------------------------------------------
# Show current version
# ---------------------------------------------------------------------------

CURRENT_VERSION=$(node "$INSTALL_DIR/dist/cli/index.js" version 2>/dev/null | head -1 || echo "unknown")
info "Current version: $CURRENT_VERSION"

# ---------------------------------------------------------------------------
# Pull latest code
# ---------------------------------------------------------------------------

section "Pulling latest code"

cd "$INSTALL_DIR"
git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  info "Already up to date — no changes to pull."
else
  git pull --ff-only origin "$BRANCH"
  info "Code updated ✓"
fi

# ---------------------------------------------------------------------------
# Reinstall dependencies and rebuild
# ---------------------------------------------------------------------------

section "Rebuilding"

npm install --omit=dev
info "Dependencies installed ✓"

npm run build
info "Build complete ✓"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

section "Done"

NEW_VERSION=$(node "$INSTALL_DIR/dist/cli/index.js" version 2>/dev/null | head -1 || echo "unknown")

echo ""
echo -e "  ${BOLD}Updated:${RESET} $CURRENT_VERSION → $NEW_VERSION"
echo ""
info "Run 'guardian doctor' to verify the installation."
echo ""
