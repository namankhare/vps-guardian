#!/usr/bin/env bash
# VPS Guardian — Install Script
# Installs VPS Guardian to /opt/vps-guardian and links the binary.
#
# Usage:
#   bash scripts/install.sh
#   bash scripts/install.sh --prefix /usr/local

set -euo pipefail

INSTALL_DIR="/opt/vps-guardian"
BIN_DIR="/usr/local/bin"
REPO_URL="https://github.com/haxworld/vps-guardian.git"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --prefix)
      BIN_DIR="$2/bin"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# Detect colours
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  RED='\033[0;31m'
  RESET='\033[0m'
  BOLD='\033[1m'
else
  GREEN='' YELLOW='' RED='' RESET='' BOLD=''
fi

info()    { echo -e "${GREEN}[INFO]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"; }

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

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

NODE_VERSION=$(node --version | cut -d. -f1 | tr -d 'v')
if [ "$NODE_VERSION" -lt 18 ]; then
  error "Node.js ≥ 18 is required. Current: $(node --version)"
fi

info "Node.js: $(node --version) ✓"
info "npm:     $(npm --version) ✓"

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------

section "Installing VPS Guardian"

if [ -d "$INSTALL_DIR" ]; then
  warn "Existing installation found at $INSTALL_DIR — pulling latest version"
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning to $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

info "Installing Node.js dependencies (production only)"
npm install --omit=dev

info "Building TypeScript"
npm run build

# ---------------------------------------------------------------------------
# Link binary
# ---------------------------------------------------------------------------

section "Linking binary"

BINARY="$INSTALL_DIR/dist/cli/index.js"
LINK="$BIN_DIR/guardian"

chmod +x "$BINARY"

if [ -L "$LINK" ] || [ -f "$LINK" ]; then
  rm -f "$LINK"
fi

ln -sf "$BINARY" "$LINK"
info "Linked: $LINK → $BINARY"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

section "Configuration"

if [ ! -f "$INSTALL_DIR/guardian.yml" ]; then
  cp "$INSTALL_DIR/guardian.example.yml" "$INSTALL_DIR/guardian.yml"
  warn "Copied example config to $INSTALL_DIR/guardian.yml"
  warn "Edit it and add your Discord webhook URL before running guardian."
else
  info "Config already exists at $INSTALL_DIR/guardian.yml — skipping"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

section "Done"
echo ""
info "VPS Guardian installed successfully!"
echo ""
echo "  Run:  guardian doctor"
echo "  Docs: $INSTALL_DIR/docs/getting-started.md"
echo ""
