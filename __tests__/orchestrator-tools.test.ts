import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskQueue } from '../src/tasks.js';
import { LockManager } from '../src/locks.js';
import { EventBus } from '../src/events.js';
import { createTaskTool } from '../src/tools/create-task.js';
import { claimTaskTool } from '../src/tools/claim-task.js';
import { completeTaskTool } from '../src/tools/complete-task.js';
import { failTaskTool } from '../src/tools/fail-task.js';
import { listTasksTool } from '../src/tools/list-tasks.js';
import { acquireLockTool } from '../src/tools/acquire-lock.js';
import { releaseLockTool } from '../src/tools/release-lock.js';
import { getActivityFeedTool } from '../src/tools/get-activity-feed.js';
import { setOrchestratorContext, getOrchestratorContext } from '../src/orchestrator-context.js';

describe('Orchestrator Tools', () => {
  let tmpDir: string;
  let queue: TaskQueue;
  let locks: LockManager;
  let events: EventBus;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'orch-tool-test-'));
    queue = new TaskQueue(tmpDir);
    locks = new LockManager(tmpDir);
    events = new EventBus(tmpDir);
    setOrchestratorContext({ locks, tasks: queue, events });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('create-task', () => {
    it('creates a task via tool', async () => {
      const tool = createTaskTool(queue);
      const result = await tool.handler({ title: 'Fix bug', description: 'Resolve #42' });
      const text = result.content[0].text;
      const task = JSON.parse(text);
      expect(task.title).toBe('Fix bug');
      expect(task.description).toBe('Resolve #42');
      expect(task.status).toBe('pending');
    });

    it('emits task:created event', async () => {
      const tool = createTaskTool(queue);
      const emitted: any[] = [];
      events.subscribe('task:created', (e) => emitted.push(e));
      await tool.handler({ title: 'Fix bug', description: 'Resolve #42' });
      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('task:created');
    });
  });

  describe('claim-task', () => {
    it('claims a pending task', async () => {
      const task = await queue.create('Fix bug', 'Resolve #42');
      const tool = claimTaskTool(queue);
      const result = await tool.handler({ taskId: task.id });
      const { success } = JSON.parse(result.content[0].text);
      expect(success).toBe(true);
    });

    it('emits task:claimed event on success', async () => {
      const task = await queue.create('Fix bug', 'Resolve #42');
      const tool = claimTaskTool(queue);
      const emitted: any[] = [];
      events.subscribe('task:claimed', (e) => emitted.push(e));
      await tool.handler({ taskId: task.id });
      expect(emitted).toHaveLength(1);
      expect(emitted[0].payload.id).toBe(task.id);
    });
  });

  describe('complete-task', () => {
    it('completes an active task', async () => {
      const task = await queue.create('Fix bug', 'Resolve #42');
      await queue.claim(task.id, 'agent');
      const tool = completeTaskTool(queue);
      const result = await tool.handler({ taskId: task.id });
      const { success } = JSON.parse(result.content[0].text);
      expect(success).toBe(true);
    });

    it('emits task:completed event', async () => {
      const task = await queue.create('Fix bug', 'Resolve #42');
      await queue.claim(task.id, 'agent');
      const tool = completeTaskTool(queue);
      const emitted: any[] = [];
      events.subscribe('task:completed', (e) => emitted.push(e));
      await tool.handler({ taskId: task.id });
      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('task:completed');
    });
  });

  describe('fail-task', () => {
    it('fails an active task', async () => {
      const task = await queue.create('Fix bug', 'Resolve #42');
      await queue.claim(task.id, 'agent');
      const tool = failTaskTool(queue);
      const result = await tool.handler({ taskId: task.id, reason: 'blocked' });
      const { success } = JSON.parse(result.content[0].text);
      expect(success).toBe(true);
    });

    it('emits task:failed event', async () => {
      const task = await queue.create('Fix bug', 'Resolve #42');
      await queue.claim(task.id, 'agent');
      const tool = failTaskTool(queue);
      const emitted: any[] = [];
      events.subscribe('task:failed', (e) => emitted.push(e));
      await tool.handler({ taskId: task.id, reason: 'blocked' });
      expect(emitted).toHaveLength(1);
      expect(emitted[0].payload.reason).toBe('blocked');
    });
  });

  describe('list-tasks', () => {
    it('lists all tasks', async () => {
      await queue.create('A', 'desc');
      await queue.create('B', 'desc');
      const tool = listTasksTool(queue);
      const result = await tool.handler({});
      const tasks = JSON.parse(result.content[0].text);
      expect(tasks).toHaveLength(2);
    });

    it('filters by status', async () => {
      const t1 = await queue.create('A', 'desc');
      await queue.create('B', 'desc');
      await queue.claim(t1.id, 'agent');
      const tool = listTasksTool(queue);
      const result = await tool.handler({ status: 'pending' });
      const tasks = JSON.parse(result.content[0].text);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('B');
    });

    it('respects limit', async () => {
      await queue.create('A', 'desc');
      await queue.create('B', 'desc');
      await queue.create('C', 'desc');
      const tool = listTasksTool(queue);
      const result = await tool.handler({ limit: 2 });
      const tasks = JSON.parse(result.content[0].text);
      expect(tasks).toHaveLength(2);
    });
  });

  describe('acquire-lock', () => {
    it('acquires a lock', async () => {
      const tool = acquireLockTool(locks);
      const result = await tool.handler({ title: 'resource-1' });
      const res = JSON.parse(result.content[0].text);
      expect(res.success).toBe(true);
      expect(res.expiresAt).toBeDefined();
    });

    it('uses default ttl of 300', async () => {
      const tool = acquireLockTool(locks);
      const result = await tool.handler({ title: 'resource-2' });
      const res = JSON.parse(result.content[0].text);
      const expires = new Date(res.expiresAt).getTime();
      const now = Date.now();
      expect(expires - now).toBeGreaterThan(290000);
      expect(expires - now).toBeLessThanOrEqual(300000);
    });

    it('accepts custom ttl', async () => {
      const tool = acquireLockTool(locks);
      const result = await tool.handler({ title: 'resource-3', ttl: 600 });
      const res = JSON.parse(result.content[0].text);
      const expires = new Date(res.expiresAt).getTime();
      const now = Date.now();
      expect(expires - now).toBeGreaterThan(590000);
    });
  });

  describe('release-lock', () => {
    it('releases a lock', async () => {
      await locks.acquire('resource-1', 'agent', 300);
      const tool = releaseLockTool(locks);
      const result = await tool.handler({ title: 'resource-1' });
      const { success } = JSON.parse(result.content[0].text);
      expect(success).toBe(true);
    });
  });

  describe('get-activity-feed', () => {
    it('returns event history', async () => {
      await events.publish({ type: 'test', payload: {}, timestamp: '2024-01-01T00:00:00Z' });
      const tool = getActivityFeedTool(events);
      const result = await tool.handler({});
      const history = JSON.parse(result.content[0].text);
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('test');
    });

    it('respects limit', async () => {
      await events.publish({ type: 'a', payload: {}, timestamp: '2024-01-01T00:00:00Z' });
      await events.publish({ type: 'b', payload: {}, timestamp: '2024-01-01T00:00:01Z' });
      await events.publish({ type: 'c', payload: {}, timestamp: '2024-01-01T00:00:02Z' });
      const tool = getActivityFeedTool(events);
      const result = await tool.handler({ limit: 2 });
      const history = JSON.parse(result.content[0].text);
      expect(history).toHaveLength(2);
      expect(history[0].type).toBe('b');
      expect(history[1].type).toBe('c');
    });

    it('uses default limit of 50', async () => {
      const tool = getActivityFeedTool(events);
      const result = await tool.handler({});
      const history = JSON.parse(result.content[0].text);
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
