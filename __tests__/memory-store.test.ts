import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { MemoryStore } from '../src/memory-store.js';

describe('MemoryStore', () => {
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

  it('creates and reads a memory', async () => {
    const mem = await store.create('auth-pattern', 'We use [[supabase-auth]].');
    expect(mem.title).toBe('auth-pattern');
    expect(mem.content).toContain('[[supabase-auth]]');
    expect(mem.links).toEqual(['supabase-auth']);
  });

  it('throws on duplicate create', async () => {
    await store.create('test', 'content');
    await expect(store.create('test', 'again')).rejects.toThrow('already exists');
  });

  it('throws on reading non-existent', async () => {
    await expect(store.read('nonexistent')).rejects.toThrow('not found');
  });

  it('updates a memory', async () => {
    await store.create('test', 'original');
    const updated = await store.update('test', { content: 'updated content' });
    expect(updated.content).toBe('updated content');
  });

  it('deletes a memory (soft)', async () => {
    await store.create('test', 'content');
    await store.delete('test');
    await expect(store.read('test')).rejects.toThrow('not found');
  });

  it('lists memories', async () => {
    await store.create('foo', 'first', ['tag1']);
    await store.create('bar', 'second', ['tag2']);
    const list = await store.list();
    expect(list).toHaveLength(2);
  });

  it('lists memories filtered by tag', async () => {
    await store.create('foo', 'first', ['tag1']);
    await store.create('bar', 'second', ['tag2']);
    const list = await store.list('tag1');
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('foo');
  });

  it('computes checksum of file content', async () => {
    await store.create('checksum-test', 'Hello checksum', ['tag']);
    const checksum = await store.checksum('checksum-test');
    expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('checksum changes when content changes', async () => {
    await store.create('checksum-test2', 'Original', []);
    const before = await store.checksum('checksum-test2');
    await store.update('checksum-test2', { content: 'Modified' });
    const after = await store.checksum('checksum-test2');
    expect(before).not.toBe(after);
  });

  it('throws on non-existent memory', async () => {
    await expect(store.checksum('nonexistent')).rejects.toThrow('not found');
  });

  it('presists author in frontmatter', async () => {
    const mem = await store.create('author-test', 'Content', [], 'Alice');
    expect(mem.author).toBe('Alice');
    const readBack = await store.read('author-test');
    expect(readBack.author).toBe('Alice');
  });

  it('preserves author on update', async () => {
    await store.create('author-update', 'Content', [], 'Alice');
    const updated = await store.update('author-update', { content: 'New content' });
    expect(updated.author).toBe('Alice');
  });

  it('allows updating author', async () => {
    await store.create('author-update2', 'Content', [], 'Alice');
    const updated = await store.update('author-update2', { author: 'Bob' });
    expect(updated.author).toBe('Bob');
  });
});
