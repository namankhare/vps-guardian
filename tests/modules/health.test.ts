import { describe, it, expect, vi } from 'vitest';
import { HealthModule } from '../../src/modules/health/index.js';

describe('HealthModule', () => {
  it('has correct id and name', () => {
    const mod = new HealthModule();
    expect(mod.id).toBe('health');
    expect(mod.name).toBe('Health');
  });

  it('is always installed', async () => {
    const mod = new HealthModule();
    expect(await mod.isInstalled()).toBe(true);
  });

  it('returns a valid ModuleResult', async () => {
    const mod = new HealthModule();
    const result = await mod.run();

    expect(result.module).toBe('health');
    expect(['healthy', 'warning', 'critical', 'skipped']).toContain(result.status);
    expect(result.details.length).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes CPU, memory, and disk in details', async () => {
    const mod = new HealthModule();
    const result = await mod.run();
    const detailText = result.details.join(' ');
    expect(detailText).toMatch(/CPU:/i);
    expect(detailText).toMatch(/Memory:/i);
    expect(detailText).toMatch(/Disk:/i);
  });
});
