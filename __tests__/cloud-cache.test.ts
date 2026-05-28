import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { CloudCache } from '../src/cloud-cache.js';

describe('CloudCache', () => {
  let cacheDir: string;
  let cache: CloudCache;

  beforeEach(async () => {
    cacheDir = join(tmpdir(), `radanmemory-cache-${randomUUID()}`);
    await mkdir(cacheDir, { recursive: true });
    cache = new CloudCache(cacheDir);
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('returns null when cache is empty', async () => {
    const projects = await cache.getProjects();
    expect(projects).toBeNull();
  });

  it('stores and retrieves projects', async () => {
    const data = [{ id: '1', name: 'Proj' }];
    await cache.setProjects(data);
    const retrieved = await cache.getProjects();
    expect(retrieved).toEqual(data);
  });

  it('stores tasks with projectId filter', async () => {
    const data = [{ id: 't1', project_id: 'p1' }];
    await cache.setTasks(data, 'p1');
    const retrieved = await cache.getTasks('p1');
    expect(retrieved).toEqual(data);
  });

  it('returns null for expired cache', async () => {
    const data = [{ id: '1', name: 'Proj' }];
    await cache.setProjects(data);
    // Fast-forward 6 minutes by modifying the mtime of the cache file
    const cacheFile = join(cacheDir, '.cache', 'projects.json');
    const past = new Date(Date.now() - 6 * 60 * 1000);
    await writeFile(cacheFile, JSON.stringify({ data, timestamp: past.toISOString() }), 'utf-8');
    const retrieved = await cache.getProjects();
    expect(retrieved).toBeNull();
  });

  it('invalidate removes all cache files', async () => {
    await cache.setProjects([{ id: '1' }]);
    await cache.invalidate();
    const projects = await cache.getProjects();
    expect(projects).toBeNull();
  });
});
