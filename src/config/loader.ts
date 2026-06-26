/**
 * Configuration loader for VPS Guardian.
 *
 * Reads `guardian.yml` from the current working directory
 * or from `/etc/guardian/guardian.yml` as a fallback.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type { GuardianConfig } from '../types/index.js';

/** Ordered list of config file locations to search */
const CONFIG_SEARCH_PATHS = [join(process.cwd(), 'guardian.yml'), '/etc/guardian/guardian.yml'];

/**
 * Find the first existing config file path from the search list.
 */
function findConfigPath(): string | null {
  for (const p of CONFIG_SEARCH_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Apply defaults for any optional fields not present in the raw config.
 */
function applyDefaults(raw: Record<string, unknown>): GuardianConfig {
  const discord = (raw['discord'] ?? {}) as Record<string, unknown>;
  const notifications = (raw['notifications'] ?? {}) as Record<string, unknown>;
  const maldet = (raw['maldet'] ?? {}) as Record<string, unknown>;

  return {
    hostname: String(raw['hostname'] ?? 'localhost'),
    discord: {
      webhook: String(discord['webhook'] ?? ''),
      notify_on: (['always', 'warning', 'critical'].includes(String(discord['notify_on']))
        ? String(discord['notify_on'])
        : 'warning') as 'always' | 'warning' | 'critical',
      username: String(discord['username'] ?? 'VPS Guardian'),
      ...(discord['avatar_url'] !== undefined && {
        avatar_url: String(discord['avatar_url']),
      }),
    },
    modules: Array.isArray(raw['modules'])
      ? (raw['modules'] as unknown[]).map(String)
      : ['health', 'aide', 'maldet', 'clamav', 'rkhunter', 'fail2ban'],
    scan_paths: Array.isArray(raw['scan_paths'])
      ? (raw['scan_paths'] as unknown[]).map(String)
      : ['/var/www', '/home', '/tmp'],
    log_dir: String(raw['log_dir'] ?? '/var/log/vps-guardian'),
    notifications: {
      always_notify: Boolean(notifications['always_notify'] ?? false),
      include_details: Boolean(notifications['include_details'] ?? true),
    },
    maldet: {
      scan_recent: maldet['scan_recent'] !== false,
      recent_days: typeof maldet['recent_days'] === 'number' ? maldet['recent_days'] : 2,
    },
  };
}

/**
 * Load and validate the Guardian configuration file.
 *
 * @param configPath - Optional explicit path to the config file.
 * @throws {Error} If no config file is found or the YAML is malformed.
 */
export function loadConfig(configPath?: string): GuardianConfig {
  const resolvedPath = configPath ?? findConfigPath();

  if (!resolvedPath) {
    throw new Error(
      `No guardian.yml found. Searched:\n  ${CONFIG_SEARCH_PATHS.join('\n  ')}\n\n` +
        'Copy guardian.example.yml to guardian.yml and fill in your settings.',
    );
  }

  let raw: unknown;
  try {
    const content = readFileSync(resolvedPath, 'utf-8');
    raw = yaml.load(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse config at ${resolvedPath}: ${msg}`);
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`Config file at ${resolvedPath} must be a YAML mapping, not a scalar or list.`);
  }

  return applyDefaults(raw as Record<string, unknown>);
}

/**
 * Check whether a config file exists without loading it.
 */
export function configExists(configPath?: string): boolean {
  if (configPath) return existsSync(configPath);
  return findConfigPath() !== null;
}
