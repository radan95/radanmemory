import type { LockManager } from './locks.js';
import type { TaskQueue } from './tasks.js';
import type { EventBus } from './events.js';

export interface OrchestratorContext {
  locks: LockManager;
  tasks: TaskQueue;
  events: EventBus;
}

let context: OrchestratorContext | null = null;

export function setOrchestratorContext(ctx: OrchestratorContext) {
  context = ctx;
}

export function getOrchestratorContext(): OrchestratorContext | null {
  return context;
}
