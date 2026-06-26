import { describe, it, expect } from 'vitest';
import { aggregateStatus, filterNotifiableResults } from '../../src/core/runner.js';
import type { GuardianConfig, ModuleResult } from '../../src/types/index.js';

const makeResult = (status: ModuleResult['status']): ModuleResult => ({
  module: 'test',
  name: 'Test',
  status,
  severity: status === 'critical' ? 'critical' : status === 'warning' ? 'warning' : 'info',
  summary: 'test summary',
  details: [],
  duration: 100,
  timestamp: new Date().toISOString(),
});

const makeConfig = (
  notify_on: 'always' | 'warning' | 'critical' = 'warning',
  always_notify = false,
): GuardianConfig => ({
  hostname: 'test-host',
  discord: {
    webhook: 'https://discord.com/api/webhooks/test',
    notify_on,
    username: 'Guardian',
  },
  modules: [],
  scan_paths: [],
  log_dir: '/tmp',
  notifications: { always_notify, include_details: true },
});

describe('aggregateStatus', () => {
  it('returns critical when any result is critical', () => {
    expect(aggregateStatus([makeResult('healthy'), makeResult('critical')])).toBe('critical');
  });

  it('returns warning when any result is warning (no critical)', () => {
    expect(aggregateStatus([makeResult('healthy'), makeResult('warning')])).toBe('warning');
  });

  it('returns healthy when all results are healthy', () => {
    expect(aggregateStatus([makeResult('healthy'), makeResult('healthy')])).toBe('healthy');
  });

  it('returns skipped when all results are skipped', () => {
    expect(aggregateStatus([makeResult('skipped'), makeResult('skipped')])).toBe('skipped');
  });

  it('prioritises critical over warning', () => {
    expect(
      aggregateStatus([makeResult('warning'), makeResult('critical'), makeResult('healthy')]),
    ).toBe('critical');
  });
});

describe('filterNotifiableResults', () => {
  it('returns all non-skipped results when always_notify is true', () => {
    const results = [makeResult('healthy'), makeResult('warning'), makeResult('skipped')];
    const filtered = filterNotifiableResults(results, makeConfig('always', true));
    expect(filtered).toHaveLength(2); // excludes skipped
  });

  it('filters to warning and critical when notify_on = warning', () => {
    const results = [makeResult('healthy'), makeResult('warning'), makeResult('critical')];
    const filtered = filterNotifiableResults(results, makeConfig('warning'));
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.status !== 'healthy')).toBe(true);
  });

  it('filters to only critical when notify_on = critical', () => {
    const results = [makeResult('healthy'), makeResult('warning'), makeResult('critical')];
    const filtered = filterNotifiableResults(results, makeConfig('critical'));
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.status).toBe('critical');
  });

  it('always excludes skipped results', () => {
    const results = [makeResult('skipped'), makeResult('warning')];
    const filtered = filterNotifiableResults(results, makeConfig('always', true));
    expect(filtered.every((r) => r.status !== 'skipped')).toBe(true);
  });
});
