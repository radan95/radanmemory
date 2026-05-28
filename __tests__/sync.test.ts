import { describe, it, expect, vi } from 'vitest';
import { SyncClient } from '../src/sync.js';

describe('SyncClient', () => {
  it('throws without API key', () => {
    delete process.env.RADANMIND_API_KEY;
    expect(() => new SyncClient()).toThrow('RADANMIND_API_KEY');
  });

  it('accepts explicit API key', () => {
    const client = new SyncClient('test-key');
    expect(client).toBeInstanceOf(SyncClient);
  });

  it('handles JSON-RPC error response', async () => {
    const client = new SyncClient('test-key');
    const mockStore = {
      list: vi.fn().mockResolvedValue([]),
    } as unknown as import('../src/memory-store.js').MemoryStore;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id: 1,
      }),
    });

    await expect(client.push(mockStore)).rejects.toThrow('Invalid Request');
  });

  it('parses accepted count from response', async () => {
    const client = new SyncClient('test-key');
    const mockStore = {
      list: vi.fn().mockResolvedValue([{ title: 'test' }]),
      read: vi.fn().mockResolvedValue({
        title: 'test',
        content: 'content',
        tags: [],
        updated: new Date().toISOString(),
      }),
    } as unknown as import('../src/memory-store.js').MemoryStore;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        jsonrpc: '2.0',
        result: { accepted: 1 },
        id: 1,
      }),
    });

    const result = await client.push(mockStore);
    expect(result.pushed).toBe(1);
  });

  it('syncBoth returns conflicts instead of throwing on push failure', async () => {
    const client = new SyncClient('test-key');
    const mockStore = {
      list: vi.fn().mockRejectedValue(new Error('Store locked')),
    } as unknown as import('../src/memory-store.js').MemoryStore;

    const result = await client.syncBoth(mockStore);
    expect(result.pushed).toBe(0);
    expect(result.conflicts.some((c) => c.includes('push-error'))).toBe(true);
  });

  it('syncBoth returns conflicts instead of throwing on pull failure', async () => {
    const client = new SyncClient('test-key');
    const mockStore = {
      list: vi.fn().mockResolvedValue([]),
    } as unknown as import('../src/memory-store.js').MemoryStore;

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await client.syncBoth(mockStore);
    expect(result.pulled).toBe(0);
    expect(result.conflicts.some((c) => c.includes('pull-error'))).toBe(true);
  });
});
