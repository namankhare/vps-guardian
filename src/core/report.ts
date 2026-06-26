/**
 * Weekly Report Generator.
 *
 * Aggregates results from all modules into a structured WeeklyReport,
 * computes a security score, and can format it for Discord or the console.
 */

import type { GuardianConfig, ModuleResult, ModuleStatus, WeeklyReport } from '../types/index.js';
import { sendDiscordNotification } from '../notifier/discord.js';
import { calculateSecurityScore } from '../utils/format.js';

/**
 * Generate a WeeklyReport from a list of module results.
 */
export function generateReport(results: ModuleResult[], config: GuardianConfig): WeeklyReport {
  const score = calculateSecurityScore(results);

  const overallStatus: ModuleStatus = results.some((r) => r.status === 'critical')
    ? 'critical'
    : results.some((r) => r.status === 'warning')
      ? 'warning'
      : 'healthy';

  return {
    hostname: config.hostname,
    generatedAt: new Date().toISOString(),
    overallStatus,
    securityScore: score,
    entries: results.map((r) => ({
      module: r.module,
      name: r.name,
      status: r.status,
      severity: r.severity,
      summary: r.summary,
    })),
  };
}

/**
 * Send a weekly report as a Discord notification.
 */
export async function sendWeeklyReport(
  report: WeeklyReport,
  results: ModuleResult[],
  config: GuardianConfig,
): Promise<void> {
  if (!config.discord.webhook) return;

  // Add the security score as a synthetic result at the top
  const syntheticScore: ModuleResult = {
    module: 'report',
    name: 'Security Score',
    status: report.overallStatus,
    severity:
      report.overallStatus === 'critical'
        ? 'critical'
        : report.overallStatus === 'warning'
          ? 'warning'
          : 'info',
    summary: `Overall security score: ${report.securityScore}/100`,
    details: [
      `Total modules: ${results.length}`,
      `Healthy: ${results.filter((r) => r.status === 'healthy').length}`,
      `Warnings: ${results.filter((r) => r.status === 'warning').length}`,
      `Critical: ${results.filter((r) => r.status === 'critical').length}`,
      `Skipped: ${results.filter((r) => r.status === 'skipped').length}`,
    ],
    duration: 0,
    timestamp: report.generatedAt,
  };

  await sendDiscordNotification(
    [syntheticScore, ...results],
    `${report.hostname} — Weekly Report`,
    config.discord,
    config.notifications.include_details,
  );
}
