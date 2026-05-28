import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { MemoryStore } from '../src/memory-store.js';
import { buildBacklinkIndex } from '../src/wikilink-parser.js';
import { searchMemories } from '../src/search.js';

describe('RadanMemory Integration', () => {
  let store: MemoryStore;
  let memDir: string;

  beforeEach(async () => {
    memDir = join(tmpdir(), `radanmemory-${randomUUID()}`);
    await mkdir(memDir, { recursive: true });
    store = new MemoryStore(memDir);
  });

  afterEach(async () => {
    await rm(memDir, { recursive: true, force: true });
  });

  it('full memory lifecycle', async () => {
    // 1. Create
    const mem1 = await store.create('auth-pattern', 'We use [[supabase-auth]] with Next.js.');
    expect(mem1.title).toBe('auth-pattern');
    expect(mem1.links).toEqual(['supabase-auth']);

    // 2. Read
    const read1 = await store.read('auth-pattern');
    expect(read1.content).toContain('Next.js');

    // 3. Update
    await store.update('auth-pattern', { content: 'We use [[supabase-auth]] with Remix.' });
    const updated = await store.read('auth-pattern');
    expect(updated.content).toContain('Remix');

    // 4. List
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('auth-pattern');

    // 5. Search
    const results = await searchMemories(memDir, 'Remix');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('auth-pattern');

    // 6. Create linked memory
    await store.create('supabase-auth', 'Auth service. See also [[auth-pattern]].');

    // 7. Backlinks
    const index = await buildBacklinkIndex(memDir);
    expect(index['auth-pattern']).toContain('supabase-auth');

    // 8. Delete
    await store.delete('auth-pattern');
    await expect(store.read('auth-pattern')).rejects.toThrow('not found');
  });
});
