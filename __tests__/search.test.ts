import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { searchMemories } from '../src/search.js';

describe('search', () => {
  let memDir: string;

  beforeEach(async () => {
    memDir = join(tmpdir(), `radanmemory-${randomUUID()}`);
    await mkdir(memDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(memDir, { recursive: true, force: true });
  });

  it('finds matching content', async () => {
    await writeFile(join(memDir, 'auth.md'), 'We use Supabase for authentication.');
    const results = await searchMemories(memDir, 'supabase');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('auth');
  });

  it('returns snippet with context', async () => {
    await writeFile(join(memDir, 'test.md'), 'Prvi red.\nDrugi red sa Supabase ovde.\nTreci red.');
    const results = await searchMemories(memDir, 'supabase');
    expect(results[0].snippet).toContain('Supabase');
  });

  it('sorts by relevance (occurrence count)', async () => {
    await writeFile(join(memDir, 'less.md'), 'Supabase je OK.');
    await writeFile(join(memDir, 'more.md'), 'Supabase je super. Supabase radi dobro. Volimo Supabase.');
    const results = await searchMemories(memDir, 'supabase');
    expect(results[0].title).toBe('more');
    expect(results[1].title).toBe('less');
  });

  it('returns empty for no match', async () => {
    await writeFile(join(memDir, 'test.md'), 'Nema trazenog teksta.');
    const results = await searchMemories(memDir, 'nonexistent');
    expect(results).toHaveLength(0);
  });

  it('case insensitive', async () => {
    await writeFile(join(memDir, 'test.md'), 'Supabase Auth');
    const results = await searchMemories(memDir, 'supabase');
    expect(results).toHaveLength(1);
  });
});
