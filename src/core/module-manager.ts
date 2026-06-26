/**
 * Module Manager — discovers and instantiates enabled modules.
 *
 * Reads the `modules` list from config and returns the corresponding
 * module instances. Unknown module IDs are silently skipped.
 */

import type { GuardianConfig, IModule } from '../types/index.js';
import { AideModule } from '../modules/aide/index.js';
import { ClamavModule } from '../modules/clamav/index.js';
import { Fail2banModule } from '../modules/fail2ban/index.js';
import { HealthModule } from '../modules/health/index.js';
import { MaldetModule } from '../modules/maldet/index.js';
import { RkhunterModule } from '../modules/rkhunter/index.js';

/** All built-in module IDs */
export type ModuleId = 'health' | 'aide' | 'maldet' | 'clamav' | 'rkhunter' | 'fail2ban';

const ALL_MODULE_IDS: ModuleId[] = ['health', 'aide', 'maldet', 'clamav', 'rkhunter', 'fail2ban'];

/**
 * Return a human-readable module description map for doctor/help output.
 */
export const MODULE_DESCRIPTIONS: Record<ModuleId, string> = {
  health: 'System health — CPU, memory, disk, load, uptime',
  aide: 'AIDE — filesystem integrity monitoring',
  maldet: 'Maldet — Linux Malware Detect scanner',
  clamav: 'ClamAV — antivirus file scanner',
  rkhunter: 'RKHunter — rootkit and backdoor detection',
  fail2ban: 'Fail2Ban — intrusion prevention monitoring',
};

/**
 * Instantiate a single module by its ID.
 *
 * @param id        - Module identifier
 * @param config    - Full Guardian config (passed to modules that need it)
 */
function createModule(id: string, config: GuardianConfig): IModule | null {
  switch (id) {
    case 'health':
      return new HealthModule();
    case 'aide':
      return new AideModule();
    case 'maldet':
      return new MaldetModule(config.scan_paths);
    case 'clamav':
      return new ClamavModule(config.scan_paths);
    case 'rkhunter':
      return new RkhunterModule();
    case 'fail2ban':
      return new Fail2banModule();
    default:
      return null;
  }
}

/**
 * Instantiate all modules enabled in the config.
 *
 * @param config - Loaded Guardian configuration
 * @returns Array of instantiated module instances in config order
 */
export function getEnabledModules(config: GuardianConfig): IModule[] {
  const modules: IModule[] = [];
  for (const id of config.modules) {
    const mod = createModule(id, config);
    if (mod) modules.push(mod);
  }
  return modules;
}

/**
 * Instantiate all known modules regardless of config (used by `doctor`).
 */
export function getAllModules(config: GuardianConfig): IModule[] {
  return ALL_MODULE_IDS.map((id) => createModule(id, config)).filter(
    (m): m is IModule => m !== null,
  );
}

/**
 * Instantiate a single module by ID. Returns null if the ID is unknown.
 */
export function getSingleModule(id: string, config: GuardianConfig): IModule | null {
  return createModule(id, config);
}
