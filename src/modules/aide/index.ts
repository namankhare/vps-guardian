/**
 * AIDE Module — filesystem integrity monitoring.
 *
 * Runs `aide --check` and parses the output for changed, added,
 * and removed files. Alerts when any integrity violations are found.
 */

import type { ModuleResult } from '../../types/index.js';
import { runCommand } from '../../utils/exec.js';
import { BaseModule } from '../base.js';

export class AideModule extends BaseModule {
  readonly id = 'aide';
  readonly name = 'AIDE';
  readonly description = 'Advanced Intrusion Detection Environment — filesystem integrity check';

  async isInstalled(): Promise<boolean> {
    return this.checkCommand('aide');
  }

  async run(): Promise<ModuleResult> {
    const startedAt = Date.now();
    try {
      if (!(await this.isInstalled())) {
        return this.skippedResult(startedAt);
      }

      // AIDE can take a while on large filesystems
      const result = await runCommand('aide', ['--check'], { timeoutMs: 300_000 });

      if (result.timedOut) {
        return this.buildResult(
          startedAt,
          'warning',
          'warning',
          'AIDE check timed out after 5 minutes',
          ['Check may be running on a very large filesystem'],
        );
      }

      return this.parseAideOutput(startedAt, result.stdout + '\n' + result.stderr);
    } catch (err) {
      return this.errorResult(startedAt, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Output parsing
  // ---------------------------------------------------------------------------

  private parseAideOutput(startedAt: number, output: string): ModuleResult {
    const lines = output.split('\n');

    // Collect changed/added/removed file lines
    const changed: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^changed:/i.test(trimmed)) changed.push(trimmed);
      else if (/^added:/i.test(trimmed)) added.push(trimmed);
      else if (/^removed:/i.test(trimmed)) removed.push(trimmed);
    }

    // Also look for summary line like "AIDE found differences between database and filesystem!!"
    const hasViolations =
      /found differences/i.test(output) ||
      changed.length > 0 ||
      added.length > 0 ||
      removed.length > 0;

    // Look for "Okay, found 0 differences" type lines
    const okMatch = output.match(/found (\d+) differences/i);
    const diffCount = okMatch
      ? parseInt(okMatch[1] ?? '0', 10)
      : changed.length + added.length + removed.length;

    if (!hasViolations || diffCount === 0) {
      return this.buildResult(
        startedAt,
        'healthy',
        'info',
        'No filesystem integrity violations found',
        ['AIDE check completed — all files match the database'],
      );
    }

    const details: string[] = [
      `Total differences: ${diffCount}`,
      ...(changed.length > 0
        ? [`Changed files (${changed.length}):`, ...changed.slice(0, 10)]
        : []),
      ...(added.length > 0 ? [`Added files (${added.length}):`, ...added.slice(0, 10)] : []),
      ...(removed.length > 0
        ? [`Removed files (${removed.length}):`, ...removed.slice(0, 10)]
        : []),
    ];

    if (changed.length + added.length + removed.length > 30) {
      details.push('... (output truncated, check logs for full list)');
    }

    return this.buildResult(
      startedAt,
      'critical',
      'critical',
      `Integrity violations: ${diffCount} difference(s) detected`,
      details,
    );
  }
}
