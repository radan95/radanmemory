import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { discoverMemoryDir, discoverOrCreateMemoryDir } from '../src/discover.js';

describe('discover', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = join(tmpdir(), `radanmemory-test-${randomUUID()}`);
    await mkdir(baseDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('returns null when no .radanmemory folder exists', async () => {
    const result = await discoverMemoryDir(baseDir);
    expect(result).toBeNull();
  });

  it('finds .radanmemory in current dir', async () => {
    const memDir = join(baseDir, '.radanmemory');
    await mkdir(memDir, { recursive: true });
    const result = await discoverMemoryDir(baseDir);
    expect(result).toBe(memDir);
  });

  it('finds .radanmemory in parent dir', async () => {
    const memDir = join(baseDir, '.radanmemory');
    await mkdir(memDir, { recursive: true });
    const subDir = join(baseDir, 'deep', 'nested');
    await mkdir(subDir, { recursive: true });

    const result = await discoverMemoryDir(subDir);
    expect(result).toBe(memDir);
  });

  it('creates .radanmemory if not found', async () => {
    const result = await discoverOrCreateMemoryDir(baseDir);
    expect(result).toBe(join(baseDir, '.radanmemory'));
  });
});
