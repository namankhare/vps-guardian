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
- **Weekly security report** with overall score
- **Zero background services** — run on demand or via cron

---

## Requirements

- Ubuntu 22.04 LTS or 24.04 LTS
- Node.js ≥ 18
- pnpm ≥ 8

Security tools are optional — modules automatically skip if the tool is not installed.

---

## Installation

```bash
# Clone the repository
git clone https://github.com/haxworld/vps-guardian.git
cd vps-guardian

# Install dependencies
pnpm install

# Build
pnpm build

# Link globally
npm link
```

Or use the install script:

```bash
bash scripts/install.sh
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
hostname: "my-vps"

discord:
  webhook: "https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN"
```

See [guardian.example.yml](./guardian.example.yml) for all available options.

---

## Usage

```bash
# Detect installed security tools
guardian doctor

# Display system health
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

# Show version
guardian version
```

---

## CLI Options

| Flag | Description |
|------|-------------|
| `--notify` | Send results to Discord after the run |
| `--verbose` | Show detailed module output |
| `--config <path>` | Use a custom config file path |
| `--fail-fast` | Stop scan after first critical result |

---

## Cron Example

Add to `/etc/cron.d/vps-guardian`:

```cron
# Daily security scan at 2am
0 2 * * * root /usr/local/bin/guardian scan --notify

# Weekly report on Sundays at 8am
0 8 * * 0 root /usr/local/bin/guardian report --notify
```

---

## Architecture

```
CLI (commander)
  ↓
Core Runner
  ↓
Module Manager
  ↓
Security Modules (health, aide, maldet, clamav, rkhunter, fail2ban)
  ↓
ModuleResult
  ↓
Notifier (Discord)
```

Each module is fully independent. Modules never communicate with each other. The app never throws — all errors are captured as `critical` results.

---

## Development

```bash
# Run in dev mode (no build required)
pnpm dev doctor

# Run tests
pnpm test

# Lint and format
pnpm check
pnpm format

# Build
pnpm build
```

---

## Project Structure

```
src/
  cli/          ← Commander CLI entry point
  core/         ← Runner, module manager, report generator
  modules/      ← health, aide, maldet, clamav, rkhunter, fail2ban
  notifier/     ← Discord webhook integration
  config/       ← YAML config loader
  types/        ← Shared TypeScript interfaces
  utils/        ← exec, logger, format helpers

tests/
  core/
  modules/
  notifier/
  utils/

docs/
  getting-started.md
```

---

## Contributing

This project is in its early phase and there is plenty of room to improve. If you spot a bug, have an idea, or want to add support for a new tool — contributions are very welcome.

**Good first issues:**
- Add support for a new security tool (follow the `IModule` interface in `src/modules/base.ts`)
- Improve output parsing for an existing module
- Add a Slack or Telegram notifier
- Write more tests
- Improve documentation

**How to contribute:**
1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes and add tests where practical
4. Run `pnpm test` and `pnpm build` to verify
5. Open a Pull Request with a clear description of what and why

Please follow the existing code style (Biome handles formatting — run `pnpm format` before committing).

---

## License

MIT © HaxWorld
