/**
 * Discord Notifier — sends Guardian results as rich Discord embeds.
 *
 * Uses Discord's webhook API with embed colours:
 *   Green  (#2ecc71) → healthy
 *   Yellow (#f39c12) → warning
 *   Red    (#e74c3c) → critical
 *
 * Reference: https://discord.com/developers/docs/resources/webhook
 */

import type { DiscordConfig, ModuleResult, ModuleStatus } from '../types/index.js';

// ---------------------------------------------------------------------------
// Colour map
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<ModuleStatus, number> = {
  healthy: 0x2ecc71,  // green
  warning: 0xf39c12,  // yellow/orange
  critical: 0xe74c3c, // red
  skipped: 0x95a5a6,  // grey
};

const STATUS_EMOJI: Record<ModuleStatus, string> = {
  healthy: '✅',
  warning: '⚠️',
  critical: '🚨',
  skipped: '⏭️',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

interface DiscordWebhookPayload {
  username?: string;
  avatar_url?: string;
  embeds: DiscordEmbed[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Determine overall status colour from a list of results. */
function overallColor(results: ModuleResult[]): number {
  if (results.some((r) => r.status === 'critical')) return STATUS_COLOR.critical;
  if (results.some((r) => r.status === 'warning')) return STATUS_COLOR.warning;
  return STATUS_COLOR.healthy;
}

/** Truncate a string to `max` characters with an ellipsis. */
function truncate(str: string, max = 1024): string {
  return str.length <= max ? str : `${str.slice(0, max - 3)}...`;
}

/** Format a single module result as an embed field. */
function resultToField(result: ModuleResult, includeDetails: boolean): DiscordEmbedField {
  const icon = STATUS_EMOJI[result.status];
  const lines: string[] = [`${icon} **${result.summary}**`];

  if (includeDetails && result.details.length > 0) {
    // Show at most 5 detail lines in Discord to stay within limits
    const shown = result.details.slice(0, 5);
    lines.push(...shown.map((d) => `\`${d}\``));
    if (result.details.length > 5) {
      lines.push(`_...and ${result.details.length - 5} more_`);
    }
  }

  return {
    name: `${result.name} — ${result.status.toUpperCase()} (${result.duration}ms)`,
    value: truncate(lines.join('\n')),
    inline: false,
  };
}

// ---------------------------------------------------------------------------
// Main send function
// ---------------------------------------------------------------------------

/**
 * Send a Guardian scan result notification to Discord.
 *
 * @param results         - Array of module results
 * @param hostname        - Server hostname shown in the embed title
 * @param discordConfig   - Discord webhook config
 * @param includeDetails  - Whether to include detail lines in the embed
 */
export async function sendDiscordNotification(
  results: ModuleResult[],
  hostname: string,
  discordConfig: DiscordConfig,
  includeDetails = true,
): Promise<void> {
  if (!discordConfig.webhook) {
    throw new Error('Discord webhook URL is not configured');
  }

  const color = overallColor(results);
  const hasIssues = results.some((r) => r.status === 'critical' || r.status === 'warning');

  const overallIcon = results.some((r) => r.status === 'critical')
    ? '🚨'
    : results.some((r) => r.status === 'warning')
      ? '⚠️'
      : '✅';

  const embed: DiscordEmbed = {
    title: `${overallIcon} VPS Guardian Report — ${hostname}`,
    description: hasIssues
      ? `Security issues detected on **${hostname}**. Review the details below.`
      : `**${hostname}** is healthy. All checks passed.`,
    color,
    fields: results.map((r) => resultToField(r, includeDetails)),
    footer: {
      text: `VPS Guardian • ${results.length} module(s) checked`,
    },
    timestamp: new Date().toISOString(),
  };

  const payload: DiscordWebhookPayload = {
    username: discordConfig.username,
    ...(discordConfig.avatar_url ? { avatar_url: discordConfig.avatar_url } : {}),
    embeds: [embed],
  };

  const response = await fetch(discordConfig.webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord webhook failed (HTTP ${response.status}): ${body}`);
  }
}

/**
 * Send a simple text alert to Discord (for errors or boot messages).
 */
export async function sendDiscordAlert(
  message: string,
  hostname: string,
  discordConfig: DiscordConfig,
): Promise<void> {
  if (!discordConfig.webhook) return;

  const payload: DiscordWebhookPayload = {
    username: discordConfig.username,
    embeds: [
      {
        title: `⚠️ VPS Guardian Alert — ${hostname}`,
        description: message,
        color: STATUS_COLOR.warning,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  await fetch(discordConfig.webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
