/**
 * RKHunter Module — rootkit and security scanner.
 *
 * Runs `rkhunter --check --sk` and parses warnings and rootkit findings.
 * Only alerts for actual warnings, not informational output.
 */

import type { ModuleResult } from '../../types/index.js';
import { runCommand } from '../../utils/exec.js';
import { BaseModule } from '../base.js';

export class RkhunterModule extends BaseModule {
  readonly id = 'rkhunter';
  readonly name = 'RKHunter';
  readonly description = 'Rootkit Hunter — scan for rootkits, backdoors, and local exploits';

  async isInstalled(): Promise<boolean> {
    return this.checkCommand('rkhunter');
  }

  async run(): Promise<ModuleResult> {
    const startedAt = Date.now();
    try {
      if (!(await this.isInstalled())) {
        return this.skippedResult(startedAt);
      }

      // --sk = skip key press prompts, --nocolors for clean parsing
      const result = await runCommand('rkhunter', ['--check', '--sk', '--nocolors'], {
        timeoutMs: 300_000,
      });

      if (result.timedOut) {
        return this.buildResult(
          startedAt,
          'warning',
          'warning',
          'RKHunter check timed out after 5 minutes',
          [],
        );
      }

      return this.parseRkhunterOutput(startedAt, result.stdout + '\n' + result.stderr);
    } catch (err) {
      return this.errorResult(startedAt, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Output parsing
  // ---------------------------------------------------------------------------

  private parseRkhunterOutput(startedAt: number, output: string): ModuleResult {
    const lines = output.split('\n');

    const warnings: string[] = [];
    const rootkitFindings: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Collect warning lines (but not "No warnings were found" lines)
      if (/\[ Warning \]/i.test(trimmed) && !/no warnings/i.test(trimmed)) {
        warnings.push(trimmed);
      }
      // Collect rootkit detection lines
      if (/\[ Infected \]/i.test(trimmed) || /rootkit found/i.test(trimmed)) {
        rootkitFindings.push(trimmed);
      }
    }

    // Also count summary stats from rkhunter output
    const warningCountMatch = output.match(/warnings found during the system checks:\s*(\d+)/i);
    const warningCount = warningCountMatch
      ? parseInt(warningCountMatch[1] ?? '0', 10)
      : warnings.length;

    if (rootkitFindings.length > 0) {
      return this.buildResult(
        startedAt,
        'critical',
        'critical',
        `Rootkit detected! ${rootkitFindings.length} finding(s)`,
        [
          `Rootkit findings: ${rootkitFindings.length}`,
          ...rootkitFindings.slice(0, 10),
          ...(warnings.length > 0 ? [`Additional warnings: ${warnings.length}`] : []),
        ],
      );
    }

    if (warningCount > 0 || warnings.length > 0) {
      const count = warningCount > 0 ? warningCount : warnings.length;
      return this.buildResult(startedAt, 'warning', 'warning', `${count} warning(s) found`, [
        `Warnings: ${count}`,
        ...warnings.slice(0, 15),
      ]);
    }

    return this.buildResult(startedAt, 'healthy', 'info', 'No rootkits or warnings detected', [
      'RKHunter completed — system appears clean',
    ]);
  }
}
