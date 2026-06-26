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

import { readFileSync, openSync, mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn, execSync } from 'node:child_process';
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

  const fd = openSync(logFile, 'w');

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

/**
 * Handle PID tracking to ensure only one Guardian instance is running.
 * Stops any previously running Guardian instance before starting a new one.
 */
function handleSingleInstance(logDir: string): void {
  const pidFile = join(logDir, 'guardian.pid');

  if (existsSync(pidFile)) {
    try {
      const oldPidStr = readFileSync(pidFile, 'utf-8').trim();
      const oldPid = parseInt(oldPidStr, 10);
      if (!isNaN(oldPid)) {
        // Send signal 0 to check if process is alive
        process.kill(oldPid, 0);
        
        console.log(`[INFO] Stopping previously running Guardian process (PID: ${String(oldPid)})...`);
        process.kill(oldPid, 'SIGTERM');

        // Wait up to 1 second (10 * 100ms) for it to exit
        let retries = 10;
        while (retries > 0) {
          try {
            process.kill(oldPid, 0);
            // Sleep 100ms
            const start = Date.now();
            while (Date.now() - start < 100) {}
            retries--;
          } catch {
            break;
          }
        }

        // Force SIGKILL if it is still alive
        try {
          process.kill(oldPid, 0);
          process.kill(oldPid, 'SIGKILL');
        } catch {
          // Already dead
        }

        // Kill orphaned sub-scanners to free resources
        try {
          execSync('killall maldet clamdscan clamscan rkhunter 2>/dev/null || true');
        } catch {
          // Ignore
        }
      }
    } catch {
      // Process is not running or other error, carry on
    }
  }

  // Write our new PID to the file
  try {
    mkdirSync(logDir, { recursive: true });
    writeFileSync(pidFile, String(process.pid), 'utf-8');
    
    // Clean up pid file on exit
    const cleanup = () => {
      try {
        if (existsSync(pidFile)) {
          const currentPid = readFileSync(pidFile, 'utf-8').trim();
          if (currentPid === String(process.pid)) {
            unlinkSync(pidFile);
          }
        }
      } catch {
        // Ignore
      }
    };

    process.on('exit', cleanup);
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
  } catch {
    // Ignore permissions/file write errors
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainingSecs = secs % 60;
  return `${mins}m ${remainingSecs}s`;
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
    handleSingleInstance(config.log_dir);

    const startTime = Date.now();
    console.log(`Execution started at: ${new Date(startTime).toISOString()}`);

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

    const endTime = Date.now();
    console.log(`\nExecution completed at: ${new Date(endTime).toISOString()} (Duration: ${formatDuration(endTime - startTime)})`);
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
    handleSingleInstance(config.log_dir);

    const startTime = Date.now();
    console.log(`Scan started at: ${new Date(startTime).toISOString()}`);

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

    const endTime = Date.now();
    console.log(`\nScan completed at: ${new Date(endTime).toISOString()} (Duration: ${formatDuration(endTime - startTime)})`);
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
      handleSingleInstance(config.log_dir);

      const startTime = Date.now();
      console.log(`Execution started at: ${new Date(startTime).toISOString()}`);

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
      const endTime = Date.now();
      console.log(`\nExecution completed at: ${new Date(endTime).toISOString()} (Duration: ${formatDuration(endTime - startTime)})`);
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
    handleSingleInstance(config.log_dir);

    const startTime = Date.now();
    console.log(`Report run started at: ${new Date(startTime).toISOString()}`);

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

    const endTime = Date.now();
    console.log(`\nReport run completed at: ${new Date(endTime).toISOString()} (Duration: ${formatDuration(endTime - startTime)})`);
    process.exit(report.overallStatus === 'critical' ? 2 : report.overallStatus === 'warning' ? 1 : 0);
  });

// ---------------------------------------------------------------------------
// logs — view or follow logs
// ---------------------------------------------------------------------------

program
  .command('logs')
  .description('View or follow Guardian logs')
  .option('-f, --follow', 'Follow log output (like tail -f)')
  .option('-n, --lines <number>', 'Number of lines to show', '20')
  .option('-t, --type <type>', 'Log type to view: background, app, modules, error', 'background')
  .option('-c, --config <path>', 'Path to guardian.yml')
  .action(async (opts: Record<string, unknown>) => {
    const { config: configPath } = parseGlobalOptions(opts);
    const config = loadConfig(configPath);
    const logType = String(opts['type'] ?? 'background');
    const follow = opts['follow'] === true;
    const lines = parseInt(String(opts['lines'] ?? '20'), 10);

    const logFileMap: Record<string, string> = {
      background: 'background.log',
      app: 'app.log',
      modules: 'modules.log',
      error: 'error.log',
    };

    const fileName = logFileMap[logType] ?? 'background.log';
    const filePath = join(config.log_dir, fileName);

    const { existsSync } = await import('node:fs');
    if (!existsSync(filePath)) {
      console.log(`  Log file not found: ${filePath}`);
      process.exit(0);
    }

    if (follow) {
      console.log(`  Following log: ${filePath} (Press Ctrl+C to exit)\n`);
      const child = spawn('tail', ['-n', String(lines), '-f', filePath], {
        stdio: 'inherit',
      });
      child.on('close', (code) => {
        process.exit(code ?? 0);
      });
      return;
    }

    const { readFile } = await import('node:fs/promises');
    const content = await readFile(filePath, 'utf-8');
    const linesArr = content.split('\n');
    const lastLines = linesArr.slice(-lines - 1);
    console.log(lastLines.join('\n').trim());
    process.exit(0);
  });

// ---------------------------------------------------------------------------
// update — pull latest code and rebuild
// ---------------------------------------------------------------------------

program
  .command('update')
  .description('Update VPS Guardian to the latest version (runs scripts/update.sh)')
  .option('--branch <name>', 'Branch to pull from', 'main')
  .option('--install-dir <path>', 'Guardian install directory', '/opt/vps-guardian')
  .action(async (opts: Record<string, unknown>) => {
    const installDir = typeof opts['installDir'] === 'string' ? opts['installDir'] : '/opt/vps-guardian';
    const branch = typeof opts['branch'] === 'string' ? opts['branch'] : 'main';
    const updateScript = join(installDir, 'scripts', 'update.sh');

    const { existsSync } = await import('node:fs');
    if (!existsSync(updateScript)) {
      console.error(`Update script not found at ${updateScript}`);
      console.error('Make sure guardian is installed at the correct path.');
      process.exit(1);
    }

    console.log(`Running update script from ${updateScript}...\n`);

    const child = spawn('bash', [updateScript, '--install-dir', installDir, '--branch', branch], {
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      process.exit(code ?? 0);
    });
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
