import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventBus } from '../src/events.js';

describe('EventBus', () => {
  let tmpDir: string;
  let bus: EventBus;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'event-test-'));
    bus = new EventBus(tmpDir);
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('publishes to a wildcard subscriber', async () => {
    const events: any[] = [];
    bus.subscribe('*', (event) => events.push(event));
    await bus.publish({ type: 'test', payload: { msg: 'hello' }, timestamp: new Date().toISOString() });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('test');
  });

  it('filters events by prefix pattern', async () => {
    const memoryEvents: any[] = [];
    const taskEvents: any[] = [];
    bus.subscribe('memory:*', (event) => memoryEvents.push(event));
    bus.subscribe('task:*', (event) => taskEvents.push(event));
    await bus.publish({ type: 'memory:updated', payload: {}, timestamp: new Date().toISOString() });
    await bus.publish({ type: 'task:created', payload: {}, timestamp: new Date().toISOString() });
    await bus.publish({ type: 'agent:connected', payload: {}, timestamp: new Date().toISOString() });
    expect(memoryEvents).toHaveLength(1);
    expect(memoryEvents[0].type).toBe('memory:updated');
    expect(taskEvents).toHaveLength(1);
    expect(taskEvents[0].type).toBe('task:created');
  });

  it('filters events by exact type', async () => {
    const exactEvents: any[] = [];
    bus.subscribe('task:created', (event) => exactEvents.push(event));
    await bus.publish({ type: 'task:created', payload: {}, timestamp: new Date().toISOString() });
    await bus.publish({ type: 'task:updated', payload: {}, timestamp: new Date().toISOString() });
    expect(exactEvents).toHaveLength(1);
    expect(exactEvents[0].type).toBe('task:created');
  });

  it('persists events and returns history', async () => {
    await bus.publish({ type: 'a', payload: {}, timestamp: '2024-01-01T00:00:00Z' });
    await bus.publish({ type: 'b', payload: {}, timestamp: '2024-01-01T00:00:01Z' });
    await bus.publish({ type: 'c', payload: {}, timestamp: '2024-01-01T00:00:02Z' });

    const history = await bus.getHistory(10);

    expect(history).toHaveLength(3);
    expect(history[1].type).toBe('b');
    expect(history[2].type).toBe('c');
  });

  it('allows unsubscribing', async () => {
    const events: any[] = [];
    const unsubscribe = bus.subscribe('*', (event) => events.push(event));
    await bus.publish({ type: 'first', payload: {}, timestamp: new Date().toISOString() });
    expect(events).toHaveLength(1);
    unsubscribe();
    await bus.publish({ type: 'second', payload: {}, timestamp: new Date().toISOString() });
    expect(events).toHaveLength(1);
  });

  it('ignores handler exceptions', async () => {
    bus.subscribe('*', () => {
      throw new Error('boom');
    });
    await expect(bus.publish({ type: 'test', payload: {}, timestamp: new Date().toISOString() })).resolves.not.toThrow();
  });

  it('persists events across instances', async () => {
    await bus.publish({ type: 'test', payload: {}, timestamp: '2024-01-01T00:00:00Z' });
    const bus2 = new EventBus(tmpDir);
    const history = await bus2.getHistory(10);
    expect(history).toHaveLength(1);
    expect(history[0].type).toBe('test');
  });
});
