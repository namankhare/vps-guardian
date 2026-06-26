import { describe, it, expect } from 'vitest';
import { runCommand, commandExists } from '../../src/utils/exec.js';

describe('runCommand', () => {
  it('captures stdout from echo', async () => {
    const result = await runCommand('echo', ['hello world']);
    expect(result.stdout).toBe('hello world');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it('captures exit code for failing commands', async () => {
    const result = await runCommand('false', []);
    expect(result.exitCode).not.toBe(0);
  });

  it('handles commands that do not exist gracefully', async () => {
    const result = await runCommand('this-command-does-not-exist-vps-guardian', []);
    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBeTruthy();
  });

  it('times out when command takes too long', async () => {
    const result = await runCommand('sleep', ['10'], { timeoutMs: 100 });
    expect(result.timedOut).toBe(true);
  });

  it('captures stderr from commands', async () => {
    const result = await runCommand('sh', ['-c', 'echo error >&2']);
    expect(result.stderr).toContain('error');
  });
});

describe('commandExists', () => {
  it('returns true for common system commands', async () => {
    expect(await commandExists('echo')).toBe(true);
    expect(await commandExists('ls')).toBe(true);
    expect(await commandExists('sh')).toBe(true);
  });

  it('returns false for non-existent commands', async () => {
    expect(await commandExists('this-command-definitely-does-not-exist-12345')).toBe(false);
  });
});
