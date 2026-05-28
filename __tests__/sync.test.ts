import { describe, it, expect } from 'vitest';
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
});
