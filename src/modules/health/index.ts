/**
 * Health Module — system resource and status monitoring.
 *
 * Collects: CPU usage, memory, disk, load average, uptime,
 * pending reboot, pending updates, Docker container count.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { ModuleResult } from '../../types/index.js';
import { runCommand } from '../../utils/exec.js';
import { formatBytes } from '../../utils/format.js';
import { BaseModule } from '../base.js';

interface SystemHealth {
  cpuPercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
  memPercent: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  diskPercent: number;
  loadAvg1: number;
  loadAvg5: number;
  loadAvg15: number;
  uptimeSeconds: number;
  pendingReboot: boolean;
  pendingUpdates: number;
  dockerContainers: number | null;
}

export class HealthModule extends BaseModule {
  readonly id = 'health';
  readonly name = 'Health';
  readonly description = 'System resource usage and overall health check';

  async isInstalled(): Promise<boolean> {
    // Health module always runs — it uses /proc and standard Unix tools
    return true;
  }

  async run(): Promise<ModuleResult> {
    const startedAt = Date.now();
    try {
      const health = await this.collectHealth();
      return this.buildResultFromHealth(startedAt, health);
    } catch (err) {
      return this.errorResult(startedAt, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Private collection helpers
  // ---------------------------------------------------------------------------

  private async collectHealth(): Promise<SystemHealth> {
    const [cpu, mem, disk, load, uptime, reboot, updates, docker] = await Promise.all([
      this.getCpuPercent(),
      this.getMemory(),
      this.getDisk(),
      this.getLoadAvg(),
      this.getUptime(),
      this.getPendingReboot(),
      this.getPendingUpdates(),
      this.getDockerContainers(),
    ]);

    return {
      cpuPercent: cpu,
      ...mem,
      ...disk,
      ...load,
      uptimeSeconds: uptime,
      pendingReboot: reboot,
      pendingUpdates: updates,
      dockerContainers: docker,
    };
  }

  /** Read /proc/stat to calculate CPU idle percentage over a short sample. */
  private async getCpuPercent(): Promise<number> {
    try {
      const read = async (): Promise<number[]> => {
        const content = await readFile('/proc/stat', 'utf-8');
        const line = content.split('\n')[0] ?? '';
        return line.split(/\s+/).slice(1).map(Number);
      };

      const s1 = await read();
      await new Promise((r) => setTimeout(r, 200));
      const s2 = await read();

      const total1 = s1.reduce((a, b) => a + b, 0);
      const idle1 = s1[3] ?? 0;
      const total2 = s2.reduce((a, b) => a + b, 0);
      const idle2 = s2[3] ?? 0;

      const totalDiff = total2 - total1;
      const idleDiff = idle2 - idle1;
      return totalDiff === 0 ? 0 : Math.round(((totalDiff - idleDiff) / totalDiff) * 100);
    } catch {
      // Fallback: use `top` snapshot
      const result = await runCommand('top', ['-bn1']);
      const match = result.stdout.match(/Cpu\(s\):\s*([\d.]+)\s*us/);
      return match ? parseFloat(match[1] ?? '0') : 0;
    }
  }

  /** Parse /proc/meminfo for total and available memory. */
  private async getMemory(): Promise<{
    memUsedBytes: number;
    memTotalBytes: number;
    memPercent: number;
  }> {
    try {
      const content = await readFile('/proc/meminfo', 'utf-8');
      const get = (key: string): number => {
        const match = content.match(new RegExp(`${key}:\\s*(\\d+)`));
        return match ? parseInt(match[1] ?? '0', 10) * 1024 : 0;
      };
      const total = get('MemTotal');
      const available = get('MemAvailable');
      const used = total - available;
      return {
        memTotalBytes: total,
        memUsedBytes: used,
        memPercent: total === 0 ? 0 : Math.round((used / total) * 100),
      };
    } catch {
      return { memTotalBytes: 0, memUsedBytes: 0, memPercent: 0 };
    }
  }

  /** Use `df` to get disk usage for the root filesystem. */
  private async getDisk(): Promise<{
    diskUsedBytes: number;
    diskTotalBytes: number;
    diskPercent: number;
  }> {
    const result = await runCommand('df', ['-B1', '/']);
    const lines = result.stdout.split('\n').filter(Boolean);
    const dataLine = lines[1] ?? '';
    const parts = dataLine.split(/\s+/);
    const total = parseInt(parts[1] ?? '0', 10);
    const used = parseInt(parts[2] ?? '0', 10);
    const pct = parseInt((parts[4] ?? '0%').replace('%', ''), 10);
    return { diskTotalBytes: total, diskUsedBytes: used, diskPercent: pct };
  }

  /** Read /proc/loadavg. */
  private async getLoadAvg(): Promise<{
    loadAvg1: number;
    loadAvg5: number;
    loadAvg15: number;
  }> {
    try {
      const content = await readFile('/proc/loadavg', 'utf-8');
      const parts = content.trim().split(/\s+/);
      return {
        loadAvg1: parseFloat(parts[0] ?? '0'),
        loadAvg5: parseFloat(parts[1] ?? '0'),
        loadAvg15: parseFloat(parts[2] ?? '0'),
      };
    } catch {
      return { loadAvg1: 0, loadAvg5: 0, loadAvg15: 0 };
    }
  }

  /** Read /proc/uptime. */
  private async getUptime(): Promise<number> {
    try {
      const content = await readFile('/proc/uptime', 'utf-8');
      return parseFloat(content.split(' ')[0] ?? '0');
    } catch {
      return 0;
    }
  }

  /** Check for the reboot-required file. */
  private async getPendingReboot(): Promise<boolean> {
    return existsSync('/var/run/reboot-required');
  }

  /** Count lines in the apt/unattended-upgrades news file or use apt-check. */
  private async getPendingUpdates(): Promise<number> {
    const result = await runCommand('/usr/lib/update-notifier/apt-check', ['--human-readable'], {
      timeoutMs: 15_000,
    });
    const match = result.stderr.match(/(\d+) packages can be updated/);
    if (match) return parseInt(match[1] ?? '0', 10);

    // Fallback: count /var/lib/apt/lists/partial (always 0 if apt is up to date)
    const aptResult = await runCommand('apt-get', ['-s', 'upgrade'], { timeoutMs: 15_000 });
    const aptMatch = aptResult.stdout.match(/(\d+) upgraded/);
    return aptMatch ? parseInt(aptMatch[1] ?? '0', 10) : 0;
  }

  /** Count running Docker containers (null if Docker not present). */
  private async getDockerContainers(): Promise<number | null> {
    const installed = await this.checkCommand('docker');
    if (!installed) return null;
    const result = await runCommand('docker', ['ps', '-q'], { timeoutMs: 10_000 });
    if (result.exitCode !== 0) return null;
    return result.stdout.split('\n').filter(Boolean).length;
  }

  // ---------------------------------------------------------------------------
  // Build result from health data
  // ---------------------------------------------------------------------------

  private formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  private buildResultFromHealth(startedAt: number, h: SystemHealth): ModuleResult {
    const issues: string[] = [];
    if (h.cpuPercent >= 90) issues.push(`CPU critically high: ${h.cpuPercent}%`);
    else if (h.cpuPercent >= 75) issues.push(`CPU elevated: ${h.cpuPercent}%`);
    if (h.memPercent >= 90) issues.push(`Memory critically high: ${h.memPercent}%`);
    else if (h.memPercent >= 80) issues.push(`Memory elevated: ${h.memPercent}%`);
    if (h.diskPercent >= 95) issues.push(`Disk critically full: ${h.diskPercent}%`);
    else if (h.diskPercent >= 85) issues.push(`Disk nearly full: ${h.diskPercent}%`);
    if (h.pendingReboot) issues.push('System reboot required');
    if (h.pendingUpdates > 0) issues.push(`${h.pendingUpdates} pending package updates`);

    const status = issues.some((i) => i.includes('critical') || i.includes('reboot'))
      ? 'critical'
      : issues.length > 0
        ? 'warning'
        : 'healthy';

    const severity = status === 'critical' ? 'critical' : status === 'warning' ? 'warning' : 'info';

    const summary =
      issues.length === 0
        ? 'All resources within normal limits'
        : (issues[0] ?? 'System health issue detected');

    const details = [
      `CPU: ${h.cpuPercent}%`,
      `Memory: ${formatBytes(h.memUsedBytes)} / ${formatBytes(h.memTotalBytes)} (${h.memPercent}%)`,
      `Disk: ${formatBytes(h.diskUsedBytes)} / ${formatBytes(h.diskTotalBytes)} (${h.diskPercent}%)`,
      `Load: ${h.loadAvg1.toFixed(2)}, ${h.loadAvg5.toFixed(2)}, ${h.loadAvg15.toFixed(2)}`,
      `Uptime: ${this.formatUptime(h.uptimeSeconds)}`,
      `Pending reboot: ${h.pendingReboot ? 'Yes ⚠' : 'No'}`,
      `Pending updates: ${h.pendingUpdates}`,
      ...(h.dockerContainers !== null ? [`Docker containers: ${h.dockerContainers}`] : []),
      ...issues,
    ];

    return this.buildResult(startedAt, status, severity, summary, details);
  }
}
