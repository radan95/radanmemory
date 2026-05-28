import { mkdir, writeFile, readFile, rename, open, unlink } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export interface LockEntry {
  agentId: string;
  acquiredAt: number;
  ttl: number;
}

export interface TaskEntry {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  assignee?: string;
  createdAt: string;
  claimedAt?: string;
  completedAt?: string;
  failedReason?: string;
  tags?: string[];
}

export interface EventEntry {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export class OrchestratorState {
  private orchDir: string;

  constructor(private memoryDir: string) {
    this.orchDir = join(memoryDir, '.orchestrator');
    // Intentionally synchronous: directory must exist before any async operations
    if (!existsSync(this.orchDir)) {
      mkdirSync(this.orchDir, { recursive: true });
    }
  }

  private async atomicWrite(filename: string, data: string) {
    const tmp = join(this.orchDir, `.${filename}.${randomUUID()}.tmp`);
    const dest = join(this.orchDir, filename);
    await writeFile(tmp, data, 'utf-8');
    try {
      await rename(tmp, dest);
    } catch {
      try {
        await unlink(tmp);
      } catch {
        // ignore cleanup failure
      }
      throw new Error(`Failed to write ${filename}`);
    }
  }

  saveLocks(locks: Record<string, LockEntry>) {
    return this.atomicWrite('locks.json', JSON.stringify(locks, null, 2));
  }

  async loadLocks(): Promise<Record<string, LockEntry>> {
    try {
      const raw = await readFile(join(this.orchDir, 'locks.json'), 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err instanceof SyntaxError) {
        return {};
      }
      return {};
    }
  }

  saveTasks(tasks: TaskEntry[]) {
    return this.atomicWrite('tasks.json', JSON.stringify(tasks, null, 2));
  }

  async loadTasks(): Promise<TaskEntry[]> {
    try {
      const raw = await readFile(join(this.orchDir, 'tasks.json'), 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err instanceof SyntaxError) {
        return [];
      }
      return [];
    }
  }

  async appendEvent(event: EventEntry) {
    const line = JSON.stringify(event) + '\n';
    const dest = join(this.orchDir, 'events.jsonl');
    const fd = await open(dest, 'a');
    try {
      await fd.write(line);
    } finally {
      await fd.close();
    }
  }

  async loadEvents(limit: number): Promise<EventEntry[]> {
    try {
      const raw = await readFile(join(this.orchDir, 'events.jsonl'), 'utf-8');
      const lines = raw.trim().split('\n').filter(Boolean);
      return lines.slice(-limit).map((l) => JSON.parse(l));
    } catch (err) {
      if (err instanceof SyntaxError) {
        return [];
      }
      return [];
    }
  }

  saveAgents(agents: Record<string, { name: string; connectedAt: string; lastSeen: string }>) {
    return this.atomicWrite('agents.json', JSON.stringify(agents, null, 2));
  }

  async loadAgents(): Promise<Record<string, { name: string; connectedAt: string; lastSeen: string }>> {
    try {
      const raw = await readFile(join(this.orchDir, 'agents.json'), 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err instanceof SyntaxError) {
        return {};
      }
      return {};
    }
  }
}
