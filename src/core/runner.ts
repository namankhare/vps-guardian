/**
 * Core Runner — orchestrates module execution.
 *
 * Runs modules in sequence (to avoid overwhelming the system with
 * parallel scans) and returns a collected list of results.
 * The runner must never throw — all module errors are captured
 * as `critical` results.
 */

import type { GuardianConfig, IModule, ModuleResult } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export interface RunOptions {
  /** If true, stop after first critical result */
  failFast?: boolean;
  /** Progress callback invoked after each module completes */
  onModuleComplete?: (result: ModuleResult) => void;
}

/**
 * Run a list of modules and return their results.
 *
 * @param modules - Module instances to run
 * @param logger  - Logger instance for progress output
 * @param options - Run behaviour options
 */
export async function runModules(
  modules: IModule[],
  logger: Logger,
  options: RunOptions = {},
): Promise<ModuleResult[]> {
  const results: ModuleResult[] = [];

  for (const mod of modules) {
    let result: ModuleResult;

    try {
      result = await mod.run();
    } catch (err) {
      // Fallback — BaseModule.run() should never throw, but just in case
      const msg = err instanceof Error ? err.message : String(err);
      result = {
        module: mod.id,
        name: mod.name,
        status: 'critical',
        severity: 'critical',
        summary: `Unexpected runner error: ${msg}`,
        details: [msg],
        duration: 0,
        timestamp: new Date().toISOString(),
      };
    }

    logger.module(result.module, result.status, result.duration);
    results.push(result);

    if (options.onModuleComplete) {
      options.onModuleComplete(result);
    }

    if (options.failFast && result.status === 'critical') {
      break;
    }
  }

  return results;
}

/**
 * Determine the overall status from a list of results.
 * Priority: critical > warning > skipped > healthy
 */
export function aggregateStatus(results: ModuleResult[]): ModuleResult['status'] {
  if (results.some((r) => r.status === 'critical')) return 'critical';
  if (results.some((r) => r.status === 'warning')) return 'warning';
  if (results.every((r) => r.status === 'skipped')) return 'skipped';
  return 'healthy';
}

/**
 * Filter results that should trigger a notification based on config.
 */
export function filterNotifiableResults(
  results: ModuleResult[],
  config: GuardianConfig,
): ModuleResult[] {
  if (config.notifications.always_notify) return results;

  const threshold = config.discord.notify_on;
  return results.filter((r) => {
    if (r.status === 'skipped') return false;
    if (threshold === 'always') return true;
    if (threshold === 'warning') return r.status === 'warning' || r.status === 'critical';
    if (threshold === 'critical') return r.status === 'critical';
    return false;
  });
}
