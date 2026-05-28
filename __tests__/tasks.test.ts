import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskQueue } from '../src/tasks.js';

describe('TaskQueue', () => {
  let tmpDir: string;
  let queue: TaskQueue;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-test-'));
    queue = new TaskQueue(tmpDir);
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a task', async () => {
    const task = await queue.create('Fix bug', 'Resolve issue #42', ['urgent']);
    expect(task.id).toBeDefined();
    expect(task.title).toBe('Fix bug');
    expect(task.description).toBe('Resolve issue #42');
    expect(task.status).toBe('pending');
    expect(task.tags).toEqual(['urgent']);
    expect(task.createdAt).toBeDefined();
  });

  it('gets a task by id', async () => {
    const task = await queue.create('Fix bug', 'Resolve issue #42');
    const found = await queue.get(task.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe('Fix bug');
  });

  it('claims a pending task', async () => {
    const task = await queue.create('Fix bug', 'Resolve issue #42');
    const claimed = await queue.claim(task.id, 'agent-1');
    expect(claimed).toBe(true);
    const found = (await queue.get(task.id))!;
    expect(found.status).toBe('active');
    expect(found.assignee).toBe('agent-1');
    expect(found.claimedAt).toBeDefined();
  });

  it('fails to claim an already active task', async () => {
    const task = await queue.create('Fix bug', 'Resolve issue #42');
    await queue.claim(task.id, 'agent-1');
    const claimed = await queue.claim(task.id, 'agent-2');
    expect(claimed).toBe(false);
  });

  it('completes an active task', async () => {
    const task = await queue.create('Fix bug', 'Resolve issue #42');
    await queue.claim(task.id, 'agent-1');
    const completed = await queue.complete(task.id, 'agent-1');
    expect(completed).toBe(true);
    const found = (await queue.get(task.id))!;
    expect(found.status).toBe('completed');
    expect(found.completedAt).toBeDefined();
  });

  it('fails to complete a task by the wrong agent', async () => {
    const task = await queue.create('Fix bug', 'Resolve issue #42');
    await queue.claim(task.id, 'agent-1');
    const completed = await queue.complete(task.id, 'agent-2');
    expect(completed).toBe(false);
  });

  it('fails an active task with a reason', async () => {
    const task = await queue.create('Fix bug', 'Resolve issue #42');
    await queue.claim(task.id, 'agent-1');
    const failed = await queue.fail(task.id, 'agent-1', 'blocked by dependency');
    expect(failed).toBe(true);
    const found = (await queue.get(task.id))!;
    expect(found.status).toBe('failed');
    expect(found.failedReason).toBe('blocked by dependency');
    expect(found.completedAt).toBeDefined();
  });

  it('fails to fail a task by the wrong agent', async () => {
    const task = await queue.create('Fix bug', 'Resolve issue #42');
    await queue.claim(task.id, 'agent-1');
    const failed = await queue.fail(task.id, 'agent-2', 'blocked');
    expect(failed).toBe(false);
  });

  it('lists tasks by status', async () => {
    const t1 = await queue.create('Fix bug', 'desc');
    const t2 = await queue.create('Add feature', 'desc');
    await queue.claim(t1.id, 'agent-1');
    await queue.complete(t1.id, 'agent-1');
    expect(await queue.list('completed')).toHaveLength(1);
    expect(await queue.list('pending')).toHaveLength(1);
    expect(await queue.list('active')).toHaveLength(0);
  });

  it('cleans up expired active tasks back to pending', async () => {
    const shortQueue = new TaskQueue(tmpDir, 0.01); // 10ms timeout
    const task = await shortQueue.create('Fix bug', 'desc');
    await shortQueue.claim(task.id, 'agent-1');
    await new Promise((r) => setTimeout(r, 50));
    await shortQueue.cleanup();
    const found = (await shortQueue.get(task.id))!;
    expect(found.status).toBe('pending');
    expect(found.assignee).toBeUndefined();
    expect(found.claimedAt).toBeUndefined();
  });

  it('persists tasks across instances', async () => {
    const task = await queue.create('Fix bug', 'desc');
    await queue.claim(task.id, 'agent-1');
    const queue2 = new TaskQueue(tmpDir);
    const found = await queue2.get(task.id);
    expect(found).toBeDefined();
    expect(found!.status).toBe('active');
    expect(found!.assignee).toBe('agent-1');
  });
});
