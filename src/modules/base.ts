/**
 * Abstract base class for all VPS Guardian modules.
 *
 * Provides shared helpers and enforces the IModule contract.
 * Every module extends this class and implements `isInstalled()` and `run()`.
 */

import type { IModule, ModuleResult, ModuleStatus, Severity } from '../types/index.js';
import { commandExists } from '../utils/exec.js';

export abstract class BaseModule implements IModule {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;

  abstract isInstalled(): Promise<boolean>;
  abstract run(): Promise<ModuleResult>;

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a standardized result object.
   *
   * @param startedAt - `Date.now()` taken before the module ran
   * @param status    - Outcome status
   * @param severity  - Severity level
   * @param summary   - One-line summary
   * @param details   - Array of detail lines
   */
  protected buildResult(
    startedAt: number,
    status: ModuleStatus,
    severity: Severity,
    summary: string,
    details: string[] = [],
  ): ModuleResult {
    return {
      module: this.id,
      name: this.name,
      status,
      severity,
      summary,
      details,
      duration: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Return a `skipped` result when the required tool is not installed.
   */
  protected skippedResult(startedAt: number): ModuleResult {
    return this.buildResult(
      startedAt,
      'skipped',
      'info',
      `${this.name} is not installed — skipped`,
    );
  }

  /**
   * Return a `critical` result when an unexpected exception was thrown.
   */
  protected errorResult(startedAt: number, err: unknown): ModuleResult {
    const msg = err instanceof Error ? err.message : String(err);
    return this.buildResult(startedAt, 'critical', 'critical', `Unexpected error: ${msg}`, [msg]);
  }

  /**
   * Check whether a named command exists on $PATH.
   */
  protected async checkCommand(name: string): Promise<boolean> {
    return commandExists(name);
  }
}
