/**
 * Notifier factory — routes notifications to the correct provider.
 *
 * Currently supports: Discord.
 * Future: Slack, Telegram, Email, Microsoft Teams.
 */

import type { GuardianConfig, ModuleResult } from '../types/index.js';
import { sendDiscordNotification } from './discord.js';

/**
 * Send a scan result notification to all configured providers.
 *
 * @param results - Module results to include
 * @param config  - Loaded Guardian configuration
 */
export async function notify(results: ModuleResult[], config: GuardianConfig): Promise<void> {
  if (!config.discord.webhook) {
    // No webhook configured — skip silently
    return;
  }

  await sendDiscordNotification(
    results,
    config.hostname,
    config.discord,
    config.notifications.include_details,
  );
}
