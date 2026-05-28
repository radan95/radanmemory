import { OrchestratorState, type LockEntry } from './orchestrator-state.js';

export interface AcquireResult { success: boolean; expiresAt?: string; }

export class LockManager {
  private state: OrchestratorState;
  private locks = new Map<string, LockEntry>();

  constructor(memoryDir: string) {
    this.state = new OrchestratorState(memoryDir);
    this.load();
  }

  private async load() {
    const saved = await this.state.loadLocks();
    for (const [title, entry] of Object.entries(saved)) {
      if (entry.acquiredAt + entry.ttl * 1000 > Date.now()) this.locks.set(title, entry);
    }
  }

  private async persist() {
    const obj: Record<string, LockEntry> = {};
    for (const [k, v] of this.locks) obj[k] = v;
    await this.state.saveLocks(obj);
  }

  async acquire(title: string, agentId: string, ttlSeconds: number): Promise<AcquireResult> {
    this.cleanup();
    const existing = this.locks.get(title);
    if (existing && existing.agentId !== agentId) return { success: false };
    const entry: LockEntry = { agentId, acquiredAt: Date.now(), ttl: ttlSeconds };
    this.locks.set(title, entry);
    await this.persist();
    return { success: true, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
  }

  async release(title: string, agentId: string): Promise<boolean> {
    const existing = this.locks.get(title);
    if (!existing || existing.agentId !== agentId) return false;
    this.locks.delete(title);
    await this.persist();
    return true;
  }

  get(title: string): LockEntry | undefined { this.cleanup(); return this.locks.get(title); }

  private cleanup() {
    const now = Date.now();
    for (const [title, entry] of this.locks) {
      if (entry.acquiredAt + entry.ttl * 1000 <= now) this.locks.delete(title);
    }
  }
}
