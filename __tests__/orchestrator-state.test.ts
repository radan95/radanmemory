import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OrchestratorState } from '../src/orchestrator-state.js';

describe('OrchestratorState', () => {
  let tmpDir: string;
  let state: OrchestratorState;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'orch-test-'));
    state = new OrchestratorState(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .orchestrator directory on init', () => {
    expect(existsSync(join(tmpDir, '.orchestrator'))).toBe(true);
  });

  it('saves and loads locks', async () => {
    await state.saveLocks({ 'auth-pattern': { agentId: 'agent-1', acquiredAt: Date.now(), ttl: 300 } });
    const locks = await state.loadLocks();
    expect(locks['auth-pattern']).toBeDefined();
    expect(locks['auth-pattern'].agentId).toBe('agent-1');
  });

  it('saves and loads tasks', async () => {
    const tasks = [{ id: 'task-1', title: 'Test', description: 'desc', status: 'pending' as const, createdAt: new Date().toISOString() }];
    await state.saveTasks(tasks);
    expect(await state.loadTasks()).toHaveLength(1);
    expect((await state.loadTasks())[0].title).toBe('Test');
  });

  it('appends events atomically', async () => {
    await state.appendEvent({ type: 'test', payload: {}, timestamp: '2024-01-01T00:00:00Z' });
    await state.appendEvent({ type: 'test2', payload: {}, timestamp: '2024-01-01T00:00:01Z' });
    const events = await state.loadEvents(10);
    expect(events).toHaveLength(2);
  });
});
