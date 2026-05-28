import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../src/session.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it('registers a session and returns an id', () => {
    const id = manager.register('agent-1', 'Claude');
    expect(id).toBeDefined();
    expect(id.startsWith('agent-1-')).toBe(true);
  });

  it('gets a session by id', () => {
    const id = manager.register('agent-1', 'Claude');
    const session = manager.get(id);
    expect(session).toBeDefined();
    expect(session!.agentId).toBe('agent-1');
    expect(session!.name).toBe('Claude');
    expect(session!.connectedAt).toBeDefined();
  });

  it('returns undefined for non-existent session', () => {
    expect(manager.get('does-not-exist')).toBeUndefined();
  });

  it('lists all sessions', () => {
    manager.register('agent-1', 'Claude');
    manager.register('agent-2', 'GPT');
    const sessions = manager.list();
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.name).sort()).toEqual(['Claude', 'GPT']);
  });

  it('removes a session', () => {
    const id = manager.register('agent-1', 'Claude');
    expect(manager.remove(id)).toBe(true);
    expect(manager.get(id)).toBeUndefined();
  });

  it('clear removes all sessions', () => {
    manager.register('agent-1', 'Claude');
    manager.register('agent-2', 'GPT');
    manager.clear();
    expect(manager.list()).toHaveLength(0);
  });
});
