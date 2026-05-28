import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { discoverMemoryDir, discoverOrCreateMemoryDir, ensureIndexFile } from '../src/discover.js';

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
    expect(existsSync(result)).toBe(true);
  });

  it('creates index file when creating new folder', async () => {
    const result = await discoverOrCreateMemoryDir(baseDir);
    expect(existsSync(join(result, '_index.md'))).toBe(true);
  });

  it('ensureIndexFile creates _index.md when missing', async () => {
    const memDir = join(baseDir, '.radanmemory');
    await mkdir(memDir, { recursive: true });
    await ensureIndexFile(memDir);
    expect(existsSync(join(memDir, '_index.md'))).toBe(true);
  });

  it('ensureIndexFile does not overwrite existing _index.md', async () => {
    const memDir = join(baseDir, '.radanmemory');
    await mkdir(memDir, { recursive: true });
    const indexPath = join(memDir, '_index.md');
    await writeFile(indexPath, 'existing content', 'utf-8');
    await ensureIndexFile(memDir);
    const content = await import('node:fs/promises').then((m) => m.readFile(indexPath, 'utf-8'));
    expect(content).toBe('existing content');
  });
});
