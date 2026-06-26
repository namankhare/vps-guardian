/**
 * Maldet (Linux Malware Detect) Module.
 *
 * Runs a scan against the configured paths and parses the hit count.
 * Alerts when malware is detected.
 */

import type { ModuleResult } from '../../types/index.js';
import { runCommand } from '../../utils/exec.js';
import { BaseModule } from '../base.js';

export class MaldetModule extends BaseModule {
  readonly id = 'maldet';
  readonly name = 'Maldet';
  readonly description = 'Linux Malware Detect — malware scanner';

  private readonly scanPaths: string[];
  private readonly scanRecent: boolean;
  private readonly recentDays: number;

  constructor(
    scanPaths: string[] = ['/var/www', '/home', '/tmp'],
    scanRecent = true,
    recentDays = 2,
  ) {
    super();
    this.scanPaths = scanPaths;
    this.scanRecent = scanRecent;
    this.recentDays = recentDays;
  }

  async isInstalled(): Promise<boolean> {
    return this.checkCommand('maldet');
  }

  async run(): Promise<ModuleResult> {
    const startedAt = Date.now();
    try {
      if (!(await this.isInstalled())) {
        return this.skippedResult(startedAt);
      }

      const paths = this.scanPaths.join(',');
      const args = this.scanRecent
        ? ['--scan-recent', paths, String(this.recentDays)]
        : ['--scan-all', paths];

      // Maldet scans can be very slow — allow up to 30 minutes
      const result = await runCommand('maldet', args, { timeoutMs: 1_800_000 });

      if (result.timedOut) {
        return this.buildResult(
          startedAt,
          'warning',
          'warning',
          'Maldet scan timed out — paths may be very large',
          [
            `Scanned paths: ${paths}`,
            `Scan type: ${this.scanRecent ? `recent (${String(this.recentDays)} days)` : 'all'}`,
          ],
        );
      }

      return this.parseMaldetOutput(startedAt, result.stdout + '\n' + result.stderr);
    } catch (err) {
      return this.errorResult(startedAt, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Output parsing
  // ---------------------------------------------------------------------------

  private parseMaldetOutput(startedAt: number, output: string): ModuleResult {
    // Look for "hits: N" in maldet output
    const hitsMatch = output.match(/hits:\s*(\d+)/i);
    const hits = hitsMatch ? parseInt(hitsMatch[1] ?? '0', 10) : 0;

    // Collect malware hit lines
    const hitLines: string[] = [];
    for (const line of output.split('\n')) {
      if (/^\{[A-Z]/.test(line.trim()) || /malware\./i.test(line)) {
        hitLines.push(line.trim());
      }
    }

    if (hits === 0 && hitLines.length === 0) {
      return this.buildResult(startedAt, 'healthy', 'info', 'No malware detected', [
        `Paths scanned: ${this.scanPaths.join(', ')}`,
      ]);
    }

    const count = hits > 0 ? hits : hitLines.length;
    return this.buildResult(
      startedAt,
      'critical',
      'critical',
      `Malware detected: ${count} hit(s)`,
      [
        `Total hits: ${count}`,
        `Paths scanned: ${this.scanPaths.join(', ')}`,
        ...hitLines.slice(0, 15),
        ...(hitLines.length > 15 ? ['... (truncated, check maldet report for full list)'] : []),
      ],
    );
  }
}
