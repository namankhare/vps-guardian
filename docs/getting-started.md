# Getting Started with VPS Guardian

## Prerequisites

Ensure you have the following installed on your Ubuntu server:

- **Node.js** ≥ 18: `node --version`
- **pnpm** ≥ 8: `pnpm --version` (install via `npm install -g pnpm`)

> **Note:** VPS Guardian requires no database, no web server, and no background service. It runs entirely on demand.

---

## Step 1 — Install

### Option A: Quick Install Script

```bash
curl -fsSL https://raw.githubusercontent.com/namankhare/vps-guardian/main/scripts/install.sh | bash
```

### Option B: Manual

```bash
git clone https://github.com/namankhare/vps-guardian.git /opt/vps-guardian
cd /opt/vps-guardian
npm install --omit=dev
npm run build
ln -sf /opt/vps-guardian/dist/cli/index.js /usr/local/bin/guardian
chmod +x /usr/local/bin/guardian
```

---

## Step 2 — Configure

```bash
cp /opt/vps-guardian/guardian.example.yml /opt/vps-guardian/guardian.yml
nano /opt/vps-guardian/guardian.yml
```

**Minimum configuration:**

```yaml
hostname: "my-vps"

discord:
  webhook: "https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN"
  notify_on: "warning"   # alert on warning or critical

modules:
  - health
  - aide
  - maldet
  - clamav
  - rkhunter
  - fail2ban
```

### Getting a Discord Webhook URL

1. Open Discord → your server → channel settings → Integrations → Webhooks
2. Create a new webhook and copy the URL
3. Paste it into `guardian.yml` under `discord.webhook`

---

## Step 3 — Verify Installation

```bash
guardian doctor
```

This will detect which security tools are installed and which modules will run.

---

## Step 4 — Run a Scan

```bash
# Test without notifications
guardian scan

# Test with Discord notification
guardian scan --notify
```

---

## Step 5 — Set Up Automatic Scans

Create a cron job:

```bash
sudo nano /etc/cron.d/vps-guardian
```

Add:

```cron
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Daily security scan at 2:00 AM
0 2 * * * root guardian scan --notify >> /var/log/vps-guardian/cron.log 2>&1

# Weekly security report every Sunday at 8:00 AM
0 8 * * 0 root guardian report --notify >> /var/log/vps-guardian/cron.log 2>&1
```

---

## Troubleshooting

### `guardian: command not found`
Ensure `/usr/local/bin` is in your `$PATH`, or use the full path: `/opt/vps-guardian/dist/cli/index.js`.

### `No guardian.yml found`
Run from the directory containing `guardian.yml`, or pass `--config /path/to/guardian.yml`.

### Module shows `skipped`
The corresponding security tool is not installed. Install it and re-run `guardian doctor`.

### Discord notification not arriving
- Verify the webhook URL in `guardian.yml`
- Check `/var/log/vps-guardian/error.log` for HTTP errors
- Test the webhook manually: `guardian scan --notify`
