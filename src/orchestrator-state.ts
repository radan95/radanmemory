import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

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
    if (!existsSync(this.orchDir)) {
      mkdirSync(this.orchDir, { recursive: true });
    }
  }

  private async atomicWrite(filename: string, data: string) {
    const tmp = join(this.orchDir, `.${filename}.tmp`);
    const dest = join(this.orchDir, filename);
    await writeFile(tmp, data, 'utf-8');
    await rename(tmp, dest);
  }

  saveLocks(locks: Record<string, LockEntry>) {
    return this.atomicWrite('locks.json', JSON.stringify(locks, null, 2));
  }

  async loadLocks(): Promise<Record<string, LockEntry>> {
    try {
      const raw = await readFile(join(this.orchDir, 'locks.json'), 'utf-8');
      return JSON.parse(raw);
    } catch {
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
    } catch {
      return [];
    }
  }

  async appendEvent(event: EventEntry) {
    const line = JSON.stringify(event) + '\n';
    const dest = join(this.orchDir, 'events.jsonl');
    let existing = '';
    try {
      existing = await readFile(dest, 'utf-8');
    } catch {
      // File doesn't exist yet, start with empty string
    }
    await this.atomicWrite('events.jsonl', existing + line);
  }

  async loadEvents(limit: number): Promise<EventEntry[]> {
    try {
      const raw = await readFile(join(this.orchDir, 'events.jsonl'), 'utf-8');
      const lines = raw.trim().split('\n').filter(Boolean);
      return lines.slice(-limit).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }

  async saveAgents(agents: Record<string, { name: string; connectedAt: string; lastSeen: string }>) {
    return this.atomicWrite('agents.json', JSON.stringify(agents, null, 2));
  }

  async loadAgents(): Promise<Record<string, { name: string; connectedAt: string; lastSeen: string }>> {
    try {
      const raw = await readFile(join(this.orchDir, 'agents.json'), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}
