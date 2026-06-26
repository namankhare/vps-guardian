/**
 * Fail2Ban Module — intrusion prevention monitoring.
 *
 * Collects the running status, banned IP count per jail, and new bans.
 * Never bans or unbans IPs — read-only monitoring only.
 */

import type { ModuleResult } from '../../types/index.js';
import { runCommand } from '../../utils/exec.js';
import { BaseModule } from '../base.js';

interface JailStatus {
  name: string;
  bannedIps: number;
  totalFailed: number;
}

export class Fail2banModule extends BaseModule {
  readonly id = 'fail2ban';
  readonly name = 'Fail2Ban';
  readonly description = 'Fail2Ban intrusion prevention — monitor banned IPs and jail status';

  async isInstalled(): Promise<boolean> {
    return this.checkCommand('fail2ban-client');
  }

  async run(): Promise<ModuleResult> {
    const startedAt = Date.now();
    try {
      if (!(await this.isInstalled())) {
        return this.skippedResult(startedAt);
      }

      const running = await this.isRunning();
      if (!running) {
        return this.buildResult(
          startedAt,
          'warning',
          'warning',
          'Fail2Ban service is not running',
          ['fail2ban-client ping returned non-zero — service may be stopped'],
        );
      }

      const jails = await this.getJailNames();
      const statuses = await this.getJailStatuses(jails);

      return this.buildResultFromStatuses(startedAt, statuses);
    } catch (err) {
      return this.errorResult(startedAt, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async isRunning(): Promise<boolean> {
    const result = await runCommand('fail2ban-client', ['ping'], { timeoutMs: 10_000 });
    return result.exitCode === 0 && result.stdout.includes('pong');
  }

  private async getJailNames(): Promise<string[]> {
    const result = await runCommand('fail2ban-client', ['status'], { timeoutMs: 10_000 });
    if (result.exitCode !== 0) return [];

    // Output: "Jail list:\t sshd, nginx-http-auth, ..."
    const match = result.stdout.match(/Jail list:\s*(.+)/i);
    if (!match) return [];
    return (match[1] ?? '')
      .split(',')
      .map((j) => j.trim())
      .filter(Boolean);
  }

  private async getJailStatuses(jails: string[]): Promise<JailStatus[]> {
    const results: JailStatus[] = [];

    for (const jail of jails) {
      const result = await runCommand('fail2ban-client', ['status', jail], { timeoutMs: 10_000 });
      if (result.exitCode !== 0) continue;

      const bannedMatch = result.stdout.match(/Currently banned:\s*(\d+)/i);
      const failedMatch = result.stdout.match(/Total failed:\s*(\d+)/i);

      results.push({
        name: jail,
        bannedIps: bannedMatch ? parseInt(bannedMatch[1] ?? '0', 10) : 0,
        totalFailed: failedMatch ? parseInt(failedMatch[1] ?? '0', 10) : 0,
      });
    }

    return results;
  }

  private buildResultFromStatuses(startedAt: number, jails: JailStatus[]): ModuleResult {
    const totalBanned = jails.reduce((sum, j) => sum + j.bannedIps, 0);
    const totalFailed = jails.reduce((sum, j) => sum + j.totalFailed, 0);

    const details: string[] = [
      `Active jails: ${jails.length}`,
      `Total currently banned IPs: ${totalBanned}`,
      `Total failed attempts: ${totalFailed}`,
      '',
      ...jails.map((j) => `  ${j.name}: ${j.bannedIps} banned, ${j.totalFailed} failed`),
    ];

    // Fail2Ban running and banning is a healthy sign — it's doing its job
    const summary =
      totalBanned > 0
        ? `Running — ${totalBanned} IP(s) currently banned across ${jails.length} jail(s)`
        : `Running — no IPs currently banned across ${jails.length} jail(s)`;

    return this.buildResult(startedAt, 'healthy', 'info', summary, details);
  }
}
