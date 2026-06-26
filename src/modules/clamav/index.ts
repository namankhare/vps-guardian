/**
 * ClamAV Module — antivirus scanner.
 *
 * Runs `clamscan --recursive` over configured paths and alerts when
 * any infected files are detected.
 */

import type { ModuleResult } from '../../types/index.js';
import { runCommand } from '../../utils/exec.js';
import { BaseModule } from '../base.js';

export class ClamavModule extends BaseModule {
  readonly id = 'clamav';
  readonly name = 'ClamAV';
  readonly description = 'ClamAV antivirus — scan for infected files';

  private readonly scanPaths: string[];

  constructor(scanPaths: string[] = ['/var/www', '/home', '/tmp']) {
    super();
    this.scanPaths = scanPaths;
  }

  async isInstalled(): Promise<boolean> {
    return this.checkCommand('clamscan');
  }

  async run(): Promise<ModuleResult> {
    const startedAt = Date.now();
    try {
      if (!(await this.isInstalled())) {
        return this.skippedResult(startedAt);
      }

      const args = ['--recursive', '--no-summary', '--infected', ...this.scanPaths];

      // ClamAV can take a long time on large filesystems
      const result = await runCommand('clamscan', args, { timeoutMs: 1_800_000 });

      if (result.timedOut) {
        return this.buildResult(
          startedAt,
          'warning',
          'warning',
          'ClamAV scan timed out — paths may be very large',
          [`Scanned paths: ${this.scanPaths.join(', ')}`],
        );
      }

      return this.parseClamavOutput(startedAt, result.stdout, result.stderr, result.exitCode);
    } catch (err) {
      return this.errorResult(startedAt, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Output parsing
  // ---------------------------------------------------------------------------

  private parseClamavOutput(
    startedAt: number,
    stdout: string,
    stderr: string,
    exitCode: number,
  ): ModuleResult {
    // clamscan exits 1 when viruses found, 0 for clean, 2 for errors
    if (exitCode === 2) {
      const errMsg = stderr || 'ClamAV returned an error';
      return this.buildResult(startedAt, 'warning', 'warning', `ClamAV error: ${errMsg}`, [errMsg]);
    }

    // With --infected, stdout only shows infected files
    const infectedLines = stdout
      .split('\n')
      .filter((l) => l.includes('FOUND'))
      .map((l) => l.trim());

    if (infectedLines.length === 0) {
      return this.buildResult(startedAt, 'healthy', 'info', 'No infected files found', [
        `Paths scanned: ${this.scanPaths.join(', ')}`,
      ]);
    }

    return this.buildResult(
      startedAt,
      'critical',
      'critical',
      `${infectedLines.length} infected file(s) found`,
      [
        `Infected files: ${infectedLines.length}`,
        `Paths scanned: ${this.scanPaths.join(', ')}`,
        ...infectedLines.slice(0, 20),
        ...(infectedLines.length > 20 ? [`... and ${infectedLines.length - 20} more`] : []),
      ],
    );
  }
}
