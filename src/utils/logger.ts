/**
 * Logger for VPS Guardian.
 *
 * Writes to both the console (with colour) and rotating log files.
 * Separate log files are maintained for application events, module
 * execution, and errors.  Files older than 30 days are pruned on startup.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// ANSI colour helpers
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

function colorize(color: string, text: string): string {
  return `${color}${text}${RESET}`;
}

// ---------------------------------------------------------------------------
// Log level
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PREFIX: Record<LogLevel, string> = {
  debug: colorize(DIM, '[DEBUG]'),
  info: colorize(CYAN, ' [INFO]'),
  warn: colorize(YELLOW, ' [WARN]'),
  error: colorize(RED, '[ERROR]'),
};

const LEVEL_FILE: Record<LogLevel, string> = {
  debug: 'app.log',
  info: 'app.log',
  warn: 'app.log',
  error: 'error.log',
};

// ---------------------------------------------------------------------------
// Logger class
// ---------------------------------------------------------------------------

/** Maximum log file age in days */
const MAX_LOG_AGE_DAYS = 30;

export class Logger {
  private readonly logDir: string;
  private readonly verbose: boolean;

  constructor(logDir: string, verbose = false) {
    this.logDir = logDir;
    this.verbose = verbose;
    this.ensureLogDir();
    this.pruneOldLogs();
  }

  /** Log a debug message (only shown in verbose mode). */
  debug(message: string): void {
    if (this.verbose) this.log('debug', message);
  }

  /** Log an informational message. */
  info(message: string): void {
    this.log('info', message);
  }

  /** Log a warning. */
  warn(message: string): void {
    this.log('warn', message);
  }

  /** Log an error. */
  error(message: string, err?: unknown): void {
    const detail = err instanceof Error ? ` — ${err.message}` : '';
    this.log('error', `${message}${detail}`);
  }

  /**
   * Log a module execution result summary.
   * Written to `modules.log` as well as the console.
   */
  module(moduleId: string, status: string, duration: number): void {
    const ts = new Date().toISOString();
    const line = `${ts} [MODULE] ${moduleId} → ${status} (${duration}ms)\n`;
    this.writeToFile('modules.log', line);
    const icon = this.statusIcon(status);
    console.log(
      `  ${icon}  ${colorize(BOLD, moduleId.padEnd(12))} ${colorize(DIM, `${duration}ms`)}`,
    );
  }

  // -------------------------------------------------------------------------
  // Console helpers used by the CLI
  // -------------------------------------------------------------------------

  /** Print a section header. */
  section(title: string): void {
    console.log(
      `\n${colorize(BOLD + MAGENTA, `━━ ${title} `)}${'━'.repeat(Math.max(0, 50 - title.length - 3))}`,
    );
  }

  /** Print a success line. */
  success(message: string): void {
    console.log(`${colorize(GREEN, '✓')} ${message}`);
  }

  /** Print a warning line. */
  warning(message: string): void {
    console.log(`${colorize(YELLOW, '⚠')} ${message}`);
  }

  /** Print an error line. */
  failure(message: string): void {
    console.log(`${colorize(RED, '✗')} ${message}`);
  }

  /** Print a skipped line. */
  skipped(message: string): void {
    console.log(`${colorize(DIM, '○')} ${colorize(DIM, message)}`);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private log(level: LogLevel, message: string): void {
    const ts = new Date().toISOString();
    const prefix = LEVEL_PREFIX[level];
    console.log(`${colorize(DIM, ts)} ${prefix} ${message}`);

    const fileLine = `${ts} [${level.toUpperCase()}] ${message}\n`;
    this.writeToFile(LEVEL_FILE[level], fileLine);
    if (level === 'error') {
      this.writeToFile('error.log', fileLine);
    }
  }

  private writeToFile(filename: string, line: string): void {
    try {
      appendFileSync(join(this.logDir, filename), line, 'utf-8');
    } catch {
      // If we can't write logs, carry on — don't crash the app
    }
  }

  private ensureLogDir(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  private pruneOldLogs(): void {
    const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
    try {
      const files = readdirSync(this.logDir);
      for (const file of files) {
        if (!file.endsWith('.log')) continue;
        const full = join(this.logDir, file);
        const stat = statSync(full);
        if (stat.mtimeMs < cutoff) {
          unlinkSync(full);
        }
      }
    } catch {
      // Non-fatal — logs directory may not exist yet
    }
  }

  private statusIcon(status: string): string {
    switch (status) {
      case 'healthy':
        return colorize(GREEN, '✓');
      case 'warning':
        return colorize(YELLOW, '⚠');
      case 'critical':
        return colorize(RED, '✗');
      default:
        return colorize(DIM, '○');
    }
  }
}

/** Create a no-op logger that only writes to console (no log dir required). */
export function createConsoleLogger(): Logger {
  return new Logger('/tmp/vps-guardian-noop', false);
}
