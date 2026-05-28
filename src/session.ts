export interface Session {
  id: string;
  agentId: string;
  name: string;
  connectedAt: string;
}

export class SessionManager {
  private sessions = new Map<string, Session>();

  register(agentId: string, name: string): string {
    const id = `${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session: Session = { id, agentId, name, connectedAt: new Date().toISOString() };
    this.sessions.set(id, session);
    return id;
  }

  get(id: string): Session | undefined { return this.sessions.get(id); }
  list(): Session[] { return Array.from(this.sessions.values()); }
  remove(id: string): boolean { return this.sessions.delete(id); }
  clear(): void { this.sessions.clear(); }
}
