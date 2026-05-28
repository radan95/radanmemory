import { randomUUID } from 'node:crypto';
import { OrchestratorState, type TaskEntry } from './orchestrator-state.js';

export class TaskQueue {
  private tasks: TaskEntry[] = [];
  private state: OrchestratorState;
  private loaded: Promise<void>;

  constructor(memoryDir: string, private timeoutSeconds: number = 1800) {
    this.state = new OrchestratorState(memoryDir);
    this.loaded = this.load();
  }

  private async load() {
    const saved = await this.state.loadTasks();
    for (const task of saved) {
      if (!this.tasks.find(t => t.id === task.id)) {
        this.tasks.push(task);
      }
    }
  }
  private async persist() { await this.state.saveTasks(this.tasks); }

  async create(title: string, description: string, tags?: string[]): Promise<TaskEntry> {
    await this.loaded;
    const task: TaskEntry = {
      id: randomUUID(), title, description, status: 'pending', tags: tags ?? [],
      createdAt: new Date().toISOString(),
    };
    this.tasks.push(task);
    await this.persist();
    return task;
  }

  async get(id: string): Promise<TaskEntry | undefined> {
    await this.loaded;
    return this.tasks.find(t => t.id === id);
  }

  async claim(id: string, agentId: string): Promise<boolean> {
    await this.loaded;
    await this.cleanup();
    const task = this.tasks.find(t => t.id === id);
    if (!task || task.status !== 'pending') return false;
    task.status = 'active'; task.assignee = agentId; task.claimedAt = new Date().toISOString();
    await this.persist();
    return true;
  }

  async complete(id: string, agentId: string): Promise<boolean> {
    await this.loaded;
    const task = this.tasks.find(t => t.id === id);
    if (!task || task.status !== 'active' || task.assignee !== agentId) return false;
    task.status = 'completed'; task.completedAt = new Date().toISOString();
    await this.persist();
    return true;
  }

  async fail(id: string, agentId: string, reason: string): Promise<boolean> {
    await this.loaded;
    const task = this.tasks.find(t => t.id === id);
    if (!task || task.status !== 'active' || task.assignee !== agentId) return false;
    task.status = 'failed'; task.failedReason = reason; task.completedAt = new Date().toISOString();
    await this.persist();
    return true;
  }

  async list(status?: 'pending' | 'active' | 'completed' | 'failed'): Promise<TaskEntry[]> {
    await this.loaded;
    await this.cleanup();
    if (status) return this.tasks.filter(t => t.status === status);
    return [...this.tasks];
  }

  async cleanup() {
    await this.loaded;
    const cutoff = new Date(Date.now() - this.timeoutSeconds * 1000).toISOString();
    for (const task of this.tasks) {
      if (task.status === 'active' && task.claimedAt && task.claimedAt < cutoff) {
        task.status = 'pending'; task.assignee = undefined; task.claimedAt = undefined;
      }
    }
    await this.persist();
  }
}
