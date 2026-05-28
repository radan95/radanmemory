import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LockManager } from '../src/locks.js';

describe('LockManager', () => {
  let tmpDir: string;
  let locks: LockManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lock-test-'));
    locks = new LockManager(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('acquires a new lock', async () => {
    const result = await locks.acquire('file.txt', 'agent-1', 300);
    expect(result.success).toBe(true);
    expect(result.expiresAt).toBeDefined();
  });

  it('gets an acquired lock', async () => {
    await locks.acquire('file.txt', 'agent-1', 300);
    const entry = locks.get('file.txt');
    expect(entry).toBeDefined();
    expect(entry!.agentId).toBe('agent-1');
  });

  it('prevents double-acquire by a different agent', async () => {
    await locks.acquire('file.txt', 'agent-1', 300);
    const result = await locks.acquire('file.txt', 'agent-2', 300);
    expect(result.success).toBe(false);
  });

  it('allows re-acquire by the same agent', async () => {
    await locks.acquire('file.txt', 'agent-1', 300);
    const result = await locks.acquire('file.txt', 'agent-1', 600);
    expect(result.success).toBe(true);
    expect(result.expiresAt).toBeDefined();
    const entry = locks.get('file.txt');
    expect(entry!.ttl).toBe(600);
  });

  it('releases a lock by the owner', async () => {
    await locks.acquire('file.txt', 'agent-1', 300);
    const released = await locks.release('file.txt', 'agent-1');
    expect(released).toBe(true);
    expect(locks.get('file.txt')).toBeUndefined();
  });

  it('prevents release by a wrong agent', async () => {
    await locks.acquire('file.txt', 'agent-1', 300);
    const released = await locks.release('file.txt', 'agent-2');
    expect(released).toBe(false);
    expect(locks.get('file.txt')).toBeDefined();
  });

  it('allows another agent to acquire after TTL expiry', async () => {
    await locks.acquire('file.txt', 'agent-1', 0.01); // 10ms
    await new Promise((r) => setTimeout(r, 50));
    const result = await locks.acquire('file.txt', 'agent-2', 300);
    expect(result.success).toBe(true);
    expect(locks.get('file.txt')!.agentId).toBe('agent-2');
  });

  it('returns undefined for expired locks', async () => {
    await locks.acquire('file.txt', 'agent-1', 0.01);
    await new Promise((r) => setTimeout(r, 50));
    expect(locks.get('file.txt')).toBeUndefined();
  });
});
