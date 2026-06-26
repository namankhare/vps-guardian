import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModuleResult } from '../../src/types/index.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { sendDiscordNotification, sendDiscordAlert } = await import('../../src/notifier/discord.js');

const makeResult = (status: ModuleResult['status']): ModuleResult => ({
  module: 'test',
  name: 'TestModule',
  status,
  severity: 'info',
  summary: `Test ${status}`,
  details: ['detail line 1', 'detail line 2'],
  duration: 150,
  timestamp: new Date().toISOString(),
});

const config = {
  webhook: 'https://discord.com/api/webhooks/123/abc',
  notify_on: 'warning' as const,
  username: 'VPS Guardian',
};

describe('sendDiscordNotification', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
  });

  it('sends a POST request to the webhook URL', async () => {
    await sendDiscordNotification([makeResult('healthy')], 'my-vps', config);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0]?.[0]).toBe(config.webhook);
    expect(mockFetch.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('includes the hostname in the embed title', async () => {
    await sendDiscordNotification([makeResult('healthy')], 'test-server', config);
    const body = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string) as {
      embeds: Array<{ title: string }>;
    };
    expect(body.embeds[0]?.title).toContain('test-server');
  });

  it('uses green colour for healthy results', async () => {
    await sendDiscordNotification([makeResult('healthy')], 'host', config);
    const body = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string) as {
      embeds: Array<{ color: number }>;
    };
    expect(body.embeds[0]?.color).toBe(0x2ecc71);
  });

  it('uses red colour for critical results', async () => {
    await sendDiscordNotification([makeResult('critical')], 'host', config);
    const body = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string) as {
      embeds: Array<{ color: number }>;
    };
    expect(body.embeds[0]?.color).toBe(0xe74c3c);
  });

  it('uses yellow colour for warning results', async () => {
    await sendDiscordNotification([makeResult('warning')], 'host', config);
    const body = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string) as {
      embeds: Array<{ color: number }>;
    };
    expect(body.embeds[0]?.color).toBe(0xf39c12);
  });

  it('throws when webhook URL is empty', async () => {
    await expect(
      sendDiscordNotification([], 'host', { ...config, webhook: '' }),
    ).rejects.toThrow('webhook URL is not configured');
  });

  it('throws when Discord returns an error status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad Request' });
    await expect(sendDiscordNotification([makeResult('healthy')], 'host', config)).rejects.toThrow(
      'HTTP 400',
    );
  });
});

describe('sendDiscordAlert', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
  });

  it('sends a simple alert embed', async () => {
    await sendDiscordAlert('Test alert message', 'my-vps', config);
    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string) as {
      embeds: Array<{ description: string }>;
    };
    expect(body.embeds[0]?.description).toBe('Test alert message');
  });

  it('silently skips when webhook is empty', async () => {
    await sendDiscordAlert('msg', 'host', { ...config, webhook: '' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
