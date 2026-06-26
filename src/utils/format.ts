/**
 * Console formatting utilities for VPS Guardian.
 *
 * Provides duration formatting, byte formatting, and pretty-printed
 * result tables for the CLI output.
 */

import type { ModuleResult, ModuleStatus, WeeklyReport } from '../types/index.js';

// ---------------------------------------------------------------------------
// ANSI helpers (kept minimal — real colours live in logger.ts)
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';

function c(col: string, text: string): string {
  return `${col}${text}${RESET}`;
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

/**
 * Format a duration in milliseconds into a human-readable string.
 * e.g. 1234 → "1.2s", 65000 → "1m 5s", 500 → "500ms"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

/**
 * Format a byte count into a human-readable string.
 * e.g. 1536 → "1.5 KB", 1073741824 → "1.0 GB"
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const label = units[unit] ?? 'B';
  return unit === 0 ? `${value} ${label}` : `${value.toFixed(1)} ${label}`;
}

// ---------------------------------------------------------------------------
// Status colours
// ---------------------------------------------------------------------------

/** Return colourised status badge. */
export function statusBadge(status: ModuleStatus): string {
  switch (status) {
    case 'healthy':
      return c(GREEN, '● HEALTHY ');
    case 'warning':
      return c(YELLOW, '● WARNING ');
    case 'critical':
      return c(RED, '● CRITICAL');
    case 'skipped':
      return c(DIM, '○ SKIPPED ');
  }
}

/** Return colourised status icon only. */
export function statusIcon(status: ModuleStatus): string {
  switch (status) {
    case 'healthy':
      return c(GREEN, '✓');
    case 'warning':
      return c(YELLOW, '⚠');
    case 'critical':
      return c(RED, '✗');
    case 'skipped':
      return c(DIM, '○');
  }
}

// ---------------------------------------------------------------------------
// Module result table
// ---------------------------------------------------------------------------

const COL_WIDTH = { name: 14, status: 12, summary: 48, duration: 8 };

function pad(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

/** Print the table header for a module results summary. */
export function printResultsHeader(): void {
  const header =
    c(BOLD, pad('MODULE', COL_WIDTH.name)) +
    '  ' +
    c(BOLD, pad('STATUS', COL_WIDTH.status)) +
    '  ' +
    c(BOLD, pad('SUMMARY', COL_WIDTH.summary)) +
    '  ' +
    c(BOLD, pad('TIME', COL_WIDTH.duration));
  const sep = c(DIM, '─'.repeat(COL_WIDTH.name + COL_WIDTH.status + COL_WIDTH.summary + COL_WIDTH.duration + 6));
  console.log(`\n${header}`);
  console.log(sep);
}

/** Print a single module result row. */
export function printResultRow(result: ModuleResult): void {
  const name = pad(result.name, COL_WIDTH.name);
  const badge = statusBadge(result.status);
  const summary = pad(result.summary, COL_WIDTH.summary);
  const duration = c(DIM, pad(formatDuration(result.duration), COL_WIDTH.duration));
  console.log(`${name}  ${badge}  ${summary}  ${duration}`);
}

/** Print details list for a module result. */
export function printResultDetails(result: ModuleResult): void {
  if (result.details.length === 0) return;
  console.log(c(DIM, `\n  Details for ${result.name}:`));
  for (const line of result.details) {
    console.log(c(DIM, `    ${line}`));
  }
}

/** Print a full results table for a list of module results. */
export function printResultsTable(results: ModuleResult[], verbose = false): void {
  printResultsHeader();
  for (const r of results) {
    printResultRow(r);
  }
  if (verbose) {
    for (const r of results) {
      if (r.details.length > 0) printResultDetails(r);
    }
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Security score
// ---------------------------------------------------------------------------

/**
 * Calculate an overall security score (0–100) from a list of module results.
 * Healthy = full points, Warning = half, Critical = zero, Skipped = excluded.
 */
export function calculateSecurityScore(results: ModuleResult[]): number {
  const scored = results.filter((r) => r.status !== 'skipped');
  if (scored.length === 0) return 100;
  const total = scored.reduce((sum, r) => {
    if (r.status === 'healthy') return sum + 100;
    if (r.status === 'warning') return sum + 50;
    return sum;
  }, 0);
  return Math.round(total / scored.length);
}

/** Format a score as a coloured badge with label. */
export function formatScore(score: number): string {
  if (score >= 80) return c(GREEN, `${score}/100 (Good)`);
  if (score >= 50) return c(YELLOW, `${score}/100 (Fair)`);
  return c(RED, `${score}/100 (Poor)`);
}

// ---------------------------------------------------------------------------
// Weekly report summary
// ---------------------------------------------------------------------------

/** Print the weekly report to stdout. */
export function printWeeklyReport(report: WeeklyReport): void {
  console.log(c(BOLD + CYAN, '\n╔══════════════════════════════════════════════════╗'));
  console.log(c(BOLD + CYAN, '║         VPS GUARDIAN — WEEKLY SECURITY REPORT   ║'));
  console.log(c(BOLD + CYAN, '╚══════════════════════════════════════════════════╝\n'));
  console.log(`  ${c(BOLD, 'Host:')}     ${report.hostname}`);
  console.log(`  ${c(BOLD, 'Generated:')} ${new Date(report.generatedAt).toLocaleString()}`);
  console.log(`  ${c(BOLD, 'Score:')}    ${formatScore(report.securityScore)}`);
  console.log(`  ${c(BOLD, 'Status:')}   ${statusBadge(report.overallStatus)}\n`);
  printResultsHeader();
  for (const entry of report.entries) {
    const name = pad(entry.name, COL_WIDTH.name);
    const badge = statusBadge(entry.status);
    const summary = pad(entry.summary, COL_WIDTH.summary);
    console.log(`${name}  ${badge}  ${summary}`);
  }
  console.log('');
}
