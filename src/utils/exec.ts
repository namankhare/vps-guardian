/**
 * Shell command execution utilities for VPS Guardian.
 *
 * Provides a safe wrapper around child_process with timeout support.
 * The application must never crash due to a command failure — all errors
 * are captured in the returned `CommandOutput`.
 */

import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import type { CommandOutput } from '../types/index.js';

/** Default command execution timeout: 60 seconds */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Execute a shell command and return its stdout, stderr, exit code,
 * and whether it timed out.
 *
 * @param cmd     - The executable to run (e.g. "aide")
 * @param args    - Arguments to pass to the executable
 * @param options - Optional overrides for timeout and working directory
 */
export function runCommand(
  cmd: string,
  args: string[] = [],
  options: { timeoutMs?: number; cwd?: string } = {},
): Promise<CommandOutput> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, cwd = process.cwd() } = options;

  return new Promise((resolve_) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve_({
        stdout: Buffer.concat(stdoutChunks).toString('utf-8').trim(),
        stderr: Buffer.concat(stderrChunks).toString('utf-8').trim(),
        exitCode: code ?? -1,
        timedOut,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve_({
        stdout: '',
        stderr: err.message,
        exitCode: -1,
        timedOut: false,
      });
    });
  });
}

/**
 * Check whether an executable exists in $PATH or as an absolute/relative path.
 *
 * @param name - Command name (e.g. "clamav") or full path
 */
export async function commandExists(name: string): Promise<boolean> {
  // If the name contains a path separator, treat it as a file path
  if (name.includes('/')) {
    try {
      await access(resolve(name), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  // Search $PATH entries
  const pathEnv = process.env['PATH'] ?? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
  const dirs = pathEnv.split(':');

  for (const dir of dirs) {
    const full = `${dir}/${name}`;
    try {
      await access(full, constants.X_OK);
      return true;
    } catch {
      // not found in this dir — continue
    }
  }

  return false;
}

/**
 * Read a file at `path` and return its content.
 * Returns `null` if the file cannot be read.
 */
export async function readFileSafe(path: string): Promise<string | null> {
  try {
    const { readFile } = await import('node:fs/promises');
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}
