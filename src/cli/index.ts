#!/usr/bin/env node
/**
 * VPS Guardian CLI — entry point.
 *
 * Commands:
 *   guardian doctor           — Detect installed software
 *   guardian health           — Display system health
 *   guardian scan             — Run all enabled modules
 *   guardian aide|maldet|...  — Run a single module
 *   guardian report           — Generate weekly security report
 *   guardian version          — Display version
 *   guardian help             — Display help
 *
 * All long-running commands accept --detach (-d) to run in the background
 * so the SSH session can be closed immediately.
 */

import { readFileSync, openSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { loadConfig, configExists } from '../config/loader.js';
import { getAllModules, getEnabledModules, getSingleModule, MODULE_DESCRIPTIONS } from '../core/module-manager.js';
import { runModules, aggregateStatus, filterNotifiableResults } from '../core/runner.js';
import { generateReport, sendWeeklyReport } from '../core/report.js';
import { notify } from '../notifier/index.js';
import { Logger } from '../utils/logger.js';
import {
  formatScore,
  printResultsTable,
  printWeeklyReport,
  statusBadge,
  calculateSecurityScore,
} from '../utils/format.js';

// ---------------------------------------------------------------------------
// Version from package.json
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
  version: string;
  description: string;
};

// ---------------------------------------------------------------------------
// CLI setup
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('guardian')
  .description('VPS Guardian — lightweight security monitoring CLI for Ubuntu servers')
  .version(pkg.version, '-v, --version', 'Display version number');

// ---------------------------------------------------------------------------
// Detach utility
// ---------------------------------------------------------------------------

/**
 * If `--detach` was requested, re-spawn the same command without `--detach`,
 * redirect its output to `logFile`, unref the child, and exit the parent.
 *
 * This lets the user close their SSH session immediately — the scan keeps
 * running in the background and results arrive on Discord via --notify.
 */
function detachIfRequested(detach: boolean | undefined, logFile: string): void {
  if (!detach) return;

  // Strip --detach / -d from the forwarded args
  const args = process.argv.slice(2).filter((a) => a !== '--detach' && a !== '-d');

  // Ensure the log directory exists before opening the file
  const logDir = logFile.substring(0, logFile.lastIndexOf('/'));
  mkdirSync(logDir, { recursive: true });

  const fd = openSync(logFile, 'a');

  const child = spawn(process.execPath, [process.argv[1] ?? '', ...args], {
    detached: true,
    stdio: ['ignore', fd, fd],
  });

  child.unref();

  console.log(`✓ Running in background — PID: ${String(child.pid)}`);
  console.log(`  Logs: ${logFile}`);
  console.log(`  Tip:  tail -f ${logFile}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Shared options helper
// ---------------------------------------------------------------------------

interface GlobalOptions {
  config?: string;
  verbose?: boolean;
  notify?: boolean;
  detach?: boolean;
}

function parseGlobalOptions(opts: Record<string, unknown>): GlobalOptions {
  const result: GlobalOptions = {
    verbose: opts['verbose'] === true,
    notify: opts['notify'] === true,
    detach: opts['detach'] === true,
  };
  if (typeof opts['config'] === 'string') {
    result.config = opts['config'];
  }
  return result;
}

// ---------------------------------------------------------------------------
// doctor — detect installed software
// ---------------------------------------------------------------------------

program
  .command('doctor')
  .description('Detect installed security software on this system')
  .option('-c, --config <path>', 'Path to guardian.yml')
  .action(async (opts: Record<string, unknown>) => {
    const { config: configPath } = parseGlobalOptions(opts);
    const logger = new Logger('/tmp/vps-guardian', false);

    logger.section('VPS Guardian — Doctor');
    console.log('  Checking installed security software...\n');

    // Load config with fallback defaults for doctor (no config required)
    const config = configExists(configPath)
      ? loadConfig(configPath)
      : {
          hostname: 'localhost',
          discord: { webhook: '', notify_on: 'warning' as const, username: 'VPS Guardian' },
          modules: [],
          scan_paths: [],
          log_dir: '/tmp/vps-guardian',
          notifications: { always_notify: false, include_details: true },
        };

    const modules = getAllModules(config);
    const results: { name: string; installed: boolean }[] = [];

    for (const mod of modules) {
      const installed = await mod.isInstalled();
      results.push({ name: mod.name, installed });

      if (installed) {
        logger.success(`${mod.name.padEnd(14)} ${MODULE_DESCRIPTIONS[mod.id as keyof typeof MODULE_DESCRIPTIONS] ?? ''}`);
      } else {
        logger.skipped(`${mod.name.padEnd(14)} not installed`);
      }
    }

    const installedCount = results.filter((r) => r.installed).length;
    console.log(`\n  ${installedCount}/${results.length} tools installed.\n`);
  });

// ---------------------------------------------------------------------------
// health — show system health
// ---------------------------------------------------------------------------

program
  .command('health')
  .description('Display system health (CPU, memory, disk, uptime, etc.)')
  .option('-c, --config <path>', 'Path to guardian.yml')
  .option('--verbose', 'Show detailed output')
  .option('--notify', 'Send result to Discord')
  .option('-d, --detach', 'Run in background — safe to close SSH')
  .action(async (opts: Record<string, unknown>) => {
    const { config: configPath, verbose, notify: shouldNotify, detach } = parseGlobalOptions(opts);

    const config = loadConfig(configPath);
    detachIfRequested(detach, `${config.log_dir}/background.log`);

    const logger = new Logger(config.log_dir);
    logger.section('VPS Guardian — System Health');

    const { HealthModule } = await import('../modules/health/index.js');
    const mod = new HealthModule();
    const result = await mod.run();

    printResultsTable([result], verbose);

    if (shouldNotify) {
      await notify([result], config);
      logger.success('Notification sent to Discord');
    }

    process.exit(result.status === 'critical' ? 1 : 0);
  });

// ---------------------------------------------------------------------------
// scan — run all enabled modules
// ---------------------------------------------------------------------------

program
  .command('scan')
  .description('Run all enabled security modules')
  .option('-c, --config <path>', 'Path to guardian.yml')
  .option('--verbose', 'Show detailed output')
  .option('--notify', 'Send results to Discord')
  .option('--fail-fast', 'Stop after first critical result')
  .option('-d, --detach', 'Run in background — safe to close SSH')
  .action(async (opts: Record<string, unknown>) => {
    const { config: configPath, verbose, notify: shouldNotify, detach } = parseGlobalOptions(opts);
    const failFast = opts['failFast'] === true;

    const config = loadConfig(configPath);
    detachIfRequested(detach, `${config.log_dir}/background.log`);

    const logger = new Logger(config.log_dir);
    logger.section(`VPS Guardian — Full Scan (${config.hostname})`);
    console.log(`  Running ${config.modules.length} module(s)...\n`);

    const modules = getEnabledModules(config);
    const results = await runModules(modules, logger, { failFast });

    printResultsTable(results, verbose);

    const overall = aggregateStatus(results);
    const score = calculateSecurityScore(results);
    console.log(`  Overall: ${statusBadge(overall)}   Score: ${formatScore(score)}\n`);

    if (shouldNotify || config.notifications.always_notify) {
      const toNotify = filterNotifiableResults(results, config);
      if (toNotify.length > 0) {
        await notify(toNotify, config);
        logger.success(`Notification sent (${toNotify.length} result(s))`);
      }
    }

    process.exit(overall === 'critical' ? 2 : overall === 'warning' ? 1 : 0);
  });

// ---------------------------------------------------------------------------
// Individual module commands
// ---------------------------------------------------------------------------

const MODULE_IDS = ['aide', 'maldet', 'clamav', 'rkhunter', 'fail2ban'] as const;

for (const id of MODULE_IDS) {
  program
    .command(id)
    .description(`Run the ${id.toUpperCase()} module`)
    .option('-c, --config <path>', 'Path to guardian.yml')
    .option('--verbose', 'Show detailed output')
    .option('--notify', 'Send result to Discord')
    .option('-d, --detach', 'Run in background — safe to close SSH')
    .action(async (opts: Record<string, unknown>) => {
      const { config: configPath, verbose, notify: shouldNotify, detach } = parseGlobalOptions(opts);
      const config = loadConfig(configPath);
      detachIfRequested(detach, `${config.log_dir}/background.log`);

      const logger = new Logger(config.log_dir);

      const mod = getSingleModule(id, config);
      if (!mod) {
        console.error(`Unknown module: ${id}`);
        process.exit(1);
      }

      logger.section(`VPS Guardian — ${mod.name}`);

      const results = await runModules([mod], logger, {});
      printResultsTable(results, verbose);

      if (shouldNotify) {
        await notify(results, config);
        logger.success('Notification sent to Discord');
      }

      const overall = aggregateStatus(results);
      process.exit(overall === 'critical' ? 2 : overall === 'warning' ? 1 : 0);
    });
}

// ---------------------------------------------------------------------------
// report — weekly security report
// ---------------------------------------------------------------------------

program
  .command('report')
  .description('Generate a weekly security report from all enabled modules')
  .option('-c, --config <path>', 'Path to guardian.yml')
  .option('--verbose', 'Show detailed output')
  .option('--notify', 'Send report to Discord')
  .option('-d, --detach', 'Run in background — safe to close SSH')
  .action(async (opts: Record<string, unknown>) => {
    const { config: configPath, verbose, notify: shouldNotify, detach } = parseGlobalOptions(opts);
    const config = loadConfig(configPath);
    detachIfRequested(detach, `${config.log_dir}/background.log`);

    const logger = new Logger(config.log_dir);
    logger.section(`VPS Guardian — Weekly Report (${config.hostname})`);
    console.log('  Collecting data from all enabled modules...\n');

    const modules = getEnabledModules(config);
    const results = await runModules(modules, logger);

    const report = generateReport(results, config);

    printWeeklyReport(report);
    if (verbose) {
      printResultsTable(results, true);
    }

    if (shouldNotify) {
      await sendWeeklyReport(report, results, config);
      logger.success('Weekly report sent to Discord');
    }

    process.exit(report.overallStatus === 'critical' ? 2 : report.overallStatus === 'warning' ? 1 : 0);
  });

// ---------------------------------------------------------------------------
// version
// ---------------------------------------------------------------------------

program
  .command('version')
  .description('Display VPS Guardian version')
  .action(() => {
    console.log(`VPS Guardian v${pkg.version}`);
    console.log(pkg.description);
  });

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

program.parse(process.argv);

// Show help if no command given
if (process.argv.length < 3) {
  program.help();
}
