# VPS Guardian

> Lightweight, modular security monitoring CLI for Ubuntu servers.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org)

> [!WARNING]
> **This project is in early development.** APIs, config schema, and CLI commands may change between versions. Use in production at your own discretion and always pin to a specific commit/tag.

VPS Guardian aggregates the output of your existing security tools — ClamAV, Maldet, AIDE, RKHunter, Fail2Ban — and sends clean, readable alerts to Discord. It never installs packages, removes malware, or modifies your system.

---

## Features

- **Health monitoring** — CPU, memory, disk, load, uptime, pending reboots & updates
- **AIDE** — filesystem integrity check
- **Maldet** — Linux Malware Detect scanner
- **ClamAV** — antivirus file scan
- **RKHunter** — rootkit and backdoor detection
- **Fail2Ban** — banned IP monitoring
- **Discord notifications** — colour-coded embeds (green/yellow/red)
- **Weekly security report** with overall security score
- **Background mode** — detach from SSH and get results on Discord
- **Zero background services** — run on demand or via cron

---

## Requirements

- Ubuntu 22.04 LTS or 24.04 LTS
- Node.js ≥ 18 (npm is included)

Security tools are **optional** — modules automatically skip if the tool is not installed.

> [!NOTE]
> **pnpm is only needed for local development.** On your VPS, the install and update scripts use `npm` — no extra setup required.

---

## Installation

### On your VPS (recommended)

```bash
# 1. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Clone and build (npm is already installed with Node.js)
sudo git clone https://github.com/YOUR_USERNAME/vps-guardian.git /opt/vps-guardian
cd /opt/vps-guardian
npm install --omit=dev   # installs only production dependencies
npm run build

# 3. Link the CLI globally
sudo ln -sf /opt/vps-guardian/dist/cli/index.js /usr/local/bin/guardian
sudo chmod +x /opt/vps-guardian/dist/cli/index.js
```

Or use the one-step install script:

```bash
bash scripts/install.sh
```

### For local development (Mac / Linux)

```bash
git clone https://github.com/YOUR_USERNAME/vps-guardian.git
cd vps-guardian
pnpm install   # installs dev dependencies too (vitest, biome, tsx, etc.)
pnpm build
```

---

## Updating

To update guardian to the latest version, run on your VPS:

```bash
sudo bash /opt/vps-guardian/scripts/update.sh
```

This pulls the latest code, reinstalls dependencies, and rebuilds. Your `guardian.yml` config is never touched.

Or use the built-in CLI command:

```bash
guardian update
```

---

## Configuration

Copy the example config and fill in your values:

```bash
cp guardian.example.yml guardian.yml
nano guardian.yml
```

Minimum required config:

```yaml
# Identifies this server in Discord notifications
hostname: "my-vps"

discord:
  webhook: "https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN"
```

See [guardian.example.yml](./guardian.example.yml) for all available options.

---

## Usage

```bash
# Check which security tools are installed on this server
guardian doctor

# Display system health (CPU, memory, disk, uptime, etc.)
guardian health

# Run all enabled modules
guardian scan

# Run a single module
guardian aide
guardian maldet
guardian clamav
guardian rkhunter
guardian fail2ban

# Generate a weekly security report
guardian report

# Send results to Discord
guardian scan --notify
guardian report --notify

# Run in the background — close SSH immediately, get results on Discord
guardian scan --notify --detach
guardian report --notify --detach

# Update guardian to the latest version
guardian update

# Show version
guardian version
```

---

## CLI Options

| Flag | Description |
|------|-------------|
| `--notify` | Send results to Discord after the run |
| `-d, --detach` | Run in the background — returns immediately, safe to close SSH |
| `--verbose` | Show detailed module output |
| `--config <path>` | Use a custom config file path |
| `--fail-fast` | Stop on first critical result (`scan` only) |

### Running in the background

Add `--detach` (or `-d`) to any command to immediately return control to your terminal. The process keeps running on the server and results arrive on Discord via `--notify`.

```bash
# Start, then close your SSH session — Discord will notify you when done
guardian report --notify --detach

# Watch the background log if you stay connected
tail -f /var/log/vps-guardian/background.log
```

---

## Automatic Scans

Use the included setup script to install a cron job. It creates a **daily security scan** and a **weekly report**, both with Discord notifications.

### Quick setup (recommended)

SSH into your VPS and run:

```bash
cd /opt/vps-guardian
sudo bash scripts/setup-cron.sh
```

Defaults:
- **Daily scan** — every day at 2:00 AM UTC
- **Weekly report** — every Sunday at 8:00 AM UTC

### Custom schedule

```bash
sudo bash scripts/setup-cron.sh \
  --scan-hour 4 \
  --report-hour 9 \
  --report-day 1      # 1 = Monday
```

| Option | Default | Description |
|--------|---------|-------------|
| `--install-dir <path>` | `/opt/vps-guardian` | Where guardian is installed |
| `--config <path>` | `<install-dir>/guardian.yml` | Path to config file |
| `--scan-hour <0-23>` | `2` | Hour for daily scan (UTC) |
| `--report-hour <0-23>` | `8` | Hour for weekly report (UTC) |
| `--report-day <0-6>` | `0` | Day for weekly report (0 = Sunday) |
| `--no-notify` | — | Disable Discord notifications |
| `--uninstall` | — | Remove the cron job |

### Monitor logs

```bash
tail -f /var/log/vps-guardian/cron.log
```

### Remove the cron job

```bash
sudo bash /opt/vps-guardian/scripts/setup-cron.sh --uninstall
```

---

## How it works

```
guardian scan / report
      ↓
Config Loader  — reads guardian.yml
      ↓
Module Manager — instantiates enabled modules
      ↓
Core Runner    — runs each module sequentially
      ↓
  HealthModule   → /proc, df, uptime
  AideModule     → aide --check
  MaldetModule   → maldet --scan-all
  ClamavModule   → clamscan --recursive
  RkhunterModule → rkhunter --check
  Fail2banModule → fail2ban-client status
      ↓
ModuleResult   — { status, severity, summary, details }
      ↓
Notifier       — Discord embed (green / yellow / red)
```

Each module is fully independent. The app **never crashes** — all errors are captured as `critical` results and reported.

---

## Development

```bash
# Run without building
pnpm dev doctor

# Run tests
pnpm test

# Lint and format
pnpm check
pnpm format

# Build
pnpm build
```

### Project Structure

```
src/
  cli/        ← Commander CLI entry point
  core/       ← Runner, module manager, report generator
  modules/    ← health, aide, maldet, clamav, rkhunter, fail2ban
  notifier/   ← Discord webhook integration
  config/     ← YAML config loader
  types/      ← Shared TypeScript interfaces
  utils/      ← exec, logger, format helpers

tests/
  core/
  modules/
  notifier/
  utils/

docs/
  getting-started.md

scripts/
  install.sh      ← One-step VPS installer
  setup-cron.sh   ← Automated cron job installer
```

---

## Contributing

This project is in its **early phase** — there is plenty of room to improve. If you spot a bug, have an idea, or want to add support for a new tool, contributions are very welcome.

**Good first issues:**
- Add support for a new security tool (follow the `IModule` interface in [`src/modules/base.ts`](./src/modules/base.ts))
- Improve output parsing for an existing module
- Add a Slack or Telegram notifier
- Write more tests
- Improve documentation

**How to contribute:**
1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes and add tests where practical
4. Run `pnpm test` and `pnpm build` to verify everything passes
5. Open a Pull Request with a clear description of what and why

Please run `pnpm format` before committing — Biome enforces a consistent code style.

---

## License

MIT © Naman Khare
