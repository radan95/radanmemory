import { randomUUID } from 'node:crypto';
import { OrchestratorState, type TaskEntry } from './orchestrator-state.js';

export class TaskQueue {
  private tasks: TaskEntry[] = [];
  private state: OrchestratorState;

  constructor(memoryDir: string, private timeoutSeconds: number = 1800) {
    this.state = new OrchestratorState(memoryDir);
    this.load();
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

  create(title: string, description: string, tags?: string[]): TaskEntry {
    const task: TaskEntry = {
      id: randomUUID(), title, description, status: 'pending', tags: tags ?? [],
      createdAt: new Date().toISOString(),
    };
    this.tasks.push(task);
    this.persist();
    return task;
  }

  get(id: string): TaskEntry | undefined { return this.tasks.find(t => t.id === id); }

  claim(id: string, agentId: string): boolean {
    this.cleanup();
    const task = this.tasks.find(t => t.id === id);
    if (!task || task.status !== 'pending') return false;
    task.status = 'active'; task.assignee = agentId; task.claimedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  complete(id: string, agentId: string): boolean {
    const task = this.tasks.find(t => t.id === id);
    if (!task || task.status !== 'active' || task.assignee !== agentId) return false;
    task.status = 'completed'; task.completedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  fail(id: string, agentId: string, reason: string): boolean {
    const task = this.tasks.find(t => t.id === id);
    if (!task || task.status !== 'active' || task.assignee !== agentId) return false;
    task.status = 'failed'; task.failedReason = reason; task.completedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  list(status?: 'pending' | 'active' | 'completed' | 'failed'): TaskEntry[] {
    this.cleanup();
    if (status) return this.tasks.filter(t => t.status === status);
    return [...this.tasks];
  }

  cleanup() {
    const cutoff = new Date(Date.now() - this.timeoutSeconds * 1000).toISOString();
    for (const task of this.tasks) {
      if (task.status === 'active' && task.claimedAt && task.claimedAt < cutoff) {
        task.status = 'pending'; task.assignee = undefined; task.claimedAt = undefined;
      }
    }
    this.persist();
  }
}
