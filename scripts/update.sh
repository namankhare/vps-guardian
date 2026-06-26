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

if ! command -v npm >/dev/null 2>&1; then
  error "npm is not installed. It ships with Node.js."
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
  NEW_VERSION=$(node "$INSTALL_DIR/dist/cli/index.js" version 2>/dev/null | head -1 || echo "unknown")
  info "Version: $NEW_VERSION"
  exit 0
fi

git pull --ff-only origin "$BRANCH"
info "Code updated ✓"

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
