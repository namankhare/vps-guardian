import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatBytes,
  calculateSecurityScore,
} from '../../src/utils/format.js';
import type { ModuleResult } from '../../src/types/index.js';

const makeResult = (status: ModuleResult['status']): ModuleResult => ({
  module: 'test',
  name: 'Test',
  status,
  severity: 'info',
  summary: 'test',
  details: [],
  duration: 100,
  timestamp: new Date().toISOString(),
});

describe('formatDuration', () => {
  it('formats milliseconds under 1s', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds under 1m', () => {
    expect(formatDuration(1200)).toBe('1.2s');
  });

  it('formats minutes', () => {
    expect(formatDuration(65000)).toBe('1m 5s');
  });
});

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });
});

describe('calculateSecurityScore', () => {
  it('returns 100 for all healthy', () => {
    const results = [makeResult('healthy'), makeResult('healthy')];
    expect(calculateSecurityScore(results)).toBe(100);
  });

  it('returns 50 for all warnings', () => {
    const results = [makeResult('warning'), makeResult('warning')];
    expect(calculateSecurityScore(results)).toBe(50);
  });

  it('returns 0 for all critical', () => {
    const results = [makeResult('critical'), makeResult('critical')];
    expect(calculateSecurityScore(results)).toBe(0);
  });

  it('excludes skipped from score calculation', () => {
    const results = [makeResult('healthy'), makeResult('skipped')];
    expect(calculateSecurityScore(results)).toBe(100);
  });

  it('returns 100 when all results are skipped', () => {
    const results = [makeResult('skipped')];
    expect(calculateSecurityScore(results)).toBe(100);
  });

  it('calculates mixed scores correctly', () => {
    // 1 healthy (100) + 1 warning (50) = 75
    const results = [makeResult('healthy'), makeResult('warning')];
    expect(calculateSecurityScore(results)).toBe(75);
  });
});
