import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RadanMindProxy } from '../src/radanmind-proxy.js';

describe('RadanMindProxy', () => {
  const mockEndpoint = 'https://mock.radanmind.com/api/mcp';
  const mockApiKey = 'rm_live_test123';

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws without apiKey', () => {
    expect(() => new RadanMindProxy({ endpoint: mockEndpoint, apiKey: '' })).toThrow('apiKey');
  });

  it('calls fetch with correct JSON-RPC payload', async () => {
    const proxy = new RadanMindProxy({ endpoint: mockEndpoint, apiKey: mockApiKey });
    
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jsonrpc: '2.0', result: { id: '123' }, id: 1 }),
    } as Response);

    await proxy.call('tools/call', { name: 'create_project', arguments: { name: 'Test' } });

    expect(global.fetch).toHaveBeenCalledWith(
      mockEndpoint,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer rm_live_test123',
        }),
        body: expect.stringContaining('"method":"tools/call"'),
      })
    );
  });

  it('returns result from JSON-RPC response', async () => {
    const proxy = new RadanMindProxy({ endpoint: mockEndpoint, apiKey: mockApiKey });
    
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jsonrpc: '2.0', result: { id: '456' }, id: 1 }),
    } as Response);

    const result = await proxy.call('tools/call', { name: 'list_projects' });
    expect(result).toEqual({ id: '456' });
  });

  it('throws on JSON-RPC error', async () => {
    const proxy = new RadanMindProxy({ endpoint: mockEndpoint, apiKey: mockApiKey });
    
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid' }, id: 1 }),
    } as Response);

    await expect(proxy.call('tools/call', {})).rejects.toThrow('Invalid');
  });

  it('throws on HTTP error', async () => {
    const proxy = new RadanMindProxy({ endpoint: mockEndpoint, apiKey: mockApiKey });
    
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    } as Response);

    await expect(proxy.call('tools/call', {})).rejects.toThrow('Forbidden');
  });
});
