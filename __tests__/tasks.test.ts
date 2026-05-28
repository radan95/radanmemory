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

  it('creates a task', () => {
    const task = queue.create('Fix bug', 'Resolve issue #42', ['urgent']);
    expect(task.id).toBeDefined();
    expect(task.title).toBe('Fix bug');
    expect(task.description).toBe('Resolve issue #42');
    expect(task.status).toBe('pending');
    expect(task.tags).toEqual(['urgent']);
    expect(task.createdAt).toBeDefined();
  });

  it('gets a task by id', () => {
    const task = queue.create('Fix bug', 'Resolve issue #42');
    const found = queue.get(task.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe('Fix bug');
  });

  it('claims a pending task', () => {
    const task = queue.create('Fix bug', 'Resolve issue #42');
    const claimed = queue.claim(task.id, 'agent-1');
    expect(claimed).toBe(true);
    const found = queue.get(task.id)!;
    expect(found.status).toBe('active');
    expect(found.assignee).toBe('agent-1');
    expect(found.claimedAt).toBeDefined();
  });

  it('fails to claim an already active task', () => {
    const task = queue.create('Fix bug', 'Resolve issue #42');
    queue.claim(task.id, 'agent-1');
    const claimed = queue.claim(task.id, 'agent-2');
    expect(claimed).toBe(false);
  });

  it('completes an active task', () => {
    const task = queue.create('Fix bug', 'Resolve issue #42');
    queue.claim(task.id, 'agent-1');
    const completed = queue.complete(task.id, 'agent-1');
    expect(completed).toBe(true);
    const found = queue.get(task.id)!;
    expect(found.status).toBe('completed');
    expect(found.completedAt).toBeDefined();
  });

  it('fails to complete a task by the wrong agent', () => {
    const task = queue.create('Fix bug', 'Resolve issue #42');
    queue.claim(task.id, 'agent-1');
    const completed = queue.complete(task.id, 'agent-2');
    expect(completed).toBe(false);
  });

  it('fails an active task with a reason', () => {
    const task = queue.create('Fix bug', 'Resolve issue #42');
    queue.claim(task.id, 'agent-1');
    const failed = queue.fail(task.id, 'agent-1', 'blocked by dependency');
    expect(failed).toBe(true);
    const found = queue.get(task.id)!;
    expect(found.status).toBe('failed');
    expect(found.failedReason).toBe('blocked by dependency');
    expect(found.completedAt).toBeDefined();
  });

  it('fails to fail a task by the wrong agent', () => {
    const task = queue.create('Fix bug', 'Resolve issue #42');
    queue.claim(task.id, 'agent-1');
    const failed = queue.fail(task.id, 'agent-2', 'blocked');
    expect(failed).toBe(false);
  });

  it('lists tasks by status', () => {
    const t1 = queue.create('Fix bug', 'desc');
    const t2 = queue.create('Add feature', 'desc');
    queue.claim(t1.id, 'agent-1');
    queue.complete(t1.id, 'agent-1');
    expect(queue.list('completed')).toHaveLength(1);
    expect(queue.list('pending')).toHaveLength(1);
    expect(queue.list('active')).toHaveLength(0);
  });

  it('cleans up expired active tasks back to pending', async () => {
    const shortQueue = new TaskQueue(tmpDir, 0.01); // 10ms timeout
    const task = shortQueue.create('Fix bug', 'desc');
    shortQueue.claim(task.id, 'agent-1');
    await new Promise((r) => setTimeout(r, 50));
    shortQueue.cleanup();
    const found = shortQueue.get(task.id)!;
    expect(found.status).toBe('pending');
    expect(found.assignee).toBeUndefined();
    expect(found.claimedAt).toBeUndefined();
  });
});
