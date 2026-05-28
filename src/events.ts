import { OrchestratorState, type EventEntry } from './orchestrator-state.js';

export type EventHandler = (event: EventEntry) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private state: OrchestratorState;

  constructor(memoryDir: string) {
    this.state = new OrchestratorState(memoryDir);
  }

  subscribe(pattern: string, handler: EventHandler): () => void {
    if (!this.handlers.has(pattern)) this.handlers.set(pattern, new Set());
    this.handlers.get(pattern)!.add(handler);
    return () => this.handlers.get(pattern)?.delete(handler);
  }

  async publish(event: EventEntry): Promise<void> {
    await this.state.appendEvent(event);
    for (const [pattern, handlers] of this.handlers) {
      if (this.match(pattern, event.type)) {
        for (const handler of handlers) {
          try { handler(event); } catch { /* ignore */ }
        }
      }
    }
  }

  async getHistory(limit: number): Promise<EventEntry[]> {
    return this.state.loadEvents(limit);
  }

  private match(pattern: string, type: string): boolean {
    if (pattern === '*') return true;
    if (pattern === type) return true;
    if (pattern.endsWith(':*')) return type.startsWith(pattern.slice(0, -1));
    return false;
  }
}
