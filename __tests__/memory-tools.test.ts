import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { MemoryStore } from '../src/memory-store.js';
import { createMemoryTool } from '../src/tools/create-memory.js';
import { updateMemoryTool } from '../src/tools/update-memory.js';
import { deleteMemoryTool } from '../src/tools/delete-memory.js';
import { EventBus } from '../src/events.js';
import { setOrchestratorContext } from '../src/orchestrator-context.js';

describe('Memory Tools - Optimistic Locking & Author', () => {
  let store: MemoryStore;
  let memDir: string;
  let events: EventBus;

  beforeEach(async () => {
    memDir = join(tmpdir(), `radanmemory-${randomUUID()}`);
    await mkdir(memDir, { recursive: true });
    store = new MemoryStore(memDir);
    events = new EventBus(memDir);
    setOrchestratorContext({ locks: null as any, tasks: null as any, events });
  });

  afterEach(async () => {
    await rm(memDir, { recursive: true, force: true });
  });

  describe('create-memory', () => {
    it('includes author in frontmatter when provided', async () => {
      const tool = createMemoryTool(store);
      const result = await tool.handler({ title: 'test-note', content: 'Hello', author: 'Alice' });
      const mem = JSON.parse(result.content[0].text);
      expect(mem.author).toBe('Alice');
    });

    it('does not require author', async () => {
      const tool = createMemoryTool(store);
      const result = await tool.handler({ title: 'test-note', content: 'Hello' });
      const mem = JSON.parse(result.content[0].text);
      expect(mem.author).toBeUndefined();
    });

    it('emits memory:created event', async () => {
      const tool = createMemoryTool(store);
      const emitted: any[] = [];
      events.subscribe('memory:created', (e) => emitted.push(e));
      await tool.handler({ title: 'test-note', content: 'Hello', author: 'Alice' });
      expect(emitted).toHaveLength(1);
      expect(emitted[0].payload.title).toBe('test-note');
      expect(emitted[0].payload.author).toBe('Alice');
    });
  });

  describe('update-memory', () => {
    it('updates with matching checksum', async () => {
      await store.create('test-note', 'Original');
      const checksum = await store.checksum('test-note');
      const tool = updateMemoryTool(store);
      const result = await tool.handler({ title: 'test-note', content: 'Updated', expected_checksum: checksum });
      const mem = JSON.parse(result.content[0].text);
      expect(mem.content).toBe('Updated');
    });

    it('throws ConflictError when checksum mismatches', async () => {
      await store.create('test-note', 'Original');
      const tool = updateMemoryTool(store);
      await expect(
        tool.handler({ title: 'test-note', content: 'Updated', expected_checksum: 'sha256:deadbeef' })
      ).rejects.toThrow('CONFLICT');
    });

    it('emits memory:updated event', async () => {
      await store.create('test-note', 'Original');
      const tool = updateMemoryTool(store);
      const emitted: any[] = [];
      events.subscribe('memory:updated', (e) => emitted.push(e));
      await tool.handler({ title: 'test-note', content: 'Updated' });
      expect(emitted).toHaveLength(1);
      expect(emitted[0].payload.title).toBe('test-note');
    });
  });

  describe('delete-memory', () => {
    it('emits memory:deleted event', async () => {
      await store.create('test-note', 'Content');
      const tool = deleteMemoryTool(store);
      const emitted: any[] = [];
      events.subscribe('memory:deleted', (e) => emitted.push(e));
      await tool.handler({ title: 'test-note' });
      expect(emitted).toHaveLength(1);
      expect(emitted[0].payload.title).toBe('test-note');
    });
  });
});
