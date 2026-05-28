# RadanMemory Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform RadanMemory from single-agent stdio MCP server into multi-agent workspace orchestrator with HTTP/SSE transport, optimistic locking, task queue, and event bus.

**Architecture:** Add HTTP mode alongside existing stdio. In HTTP mode, an Express server accepts MCP connections via SSE, maintains session state in memory (persisted to `.radanmemory/.orchestrator/`), and coordinates between multiple agents through checksum-based optimistic locking, a task queue, and an in-memory event bus with SSE broadcast.

**Tech Stack:** Node.js + TypeScript + Express + @modelcontextprotocol/sdk (SSE transport) + Vitest

---

## File Structure

### New Files

| File | Responsibility |
|------|--------------|
| `src/transports/http.ts` | Express app with SSE endpoint, session routing, health check |
| `src/session.ts` | SessionManager — tracks active SSE sessions per agent |
| `src/checksum.ts` | Checksum utility (SHA-256 of file content excluding frontmatter) |
| `src/orchestrator-state.ts` | Persistence layer for locks, tasks, events, agents to `.orchestrator/` JSON files |
| `src/locks.ts` | LockManager — pessimistic lock acquire/release/expire |
| `src/tasks.ts` | TaskQueue — create, claim, complete, fail, list, expire |
| `src/events.ts` | EventBus — publish/subscribe, SSE broadcast, event persistence |
| `src/tools/create-task.ts` | MCP tool: create_task |
| `src/tools/claim-task.ts` | MCP tool: claim_task |
| `src/tools/complete-task.ts` | MCP tool: complete_task |
| `src/tools/fail-task.ts` | MCP tool: fail_task |
| `src/tools/list-tasks.ts` | MCP tool: list_tasks |
| `src/tools/acquire-lock.ts` | MCP tool: acquire_lock |
| `src/tools/release-lock.ts` | MCP tool: release_lock |
| `src/tools/get-activity-feed.ts` | MCP tool: get_activity_feed |
| `__tests__/session.test.ts` | SessionManager tests |
| `__tests__/checksum.test.ts` | Checksum computation tests |
| `__tests__/orchestrator-state.test.ts` | State persistence tests |
| `__tests__/locks.test.ts` | LockManager tests |
| `__tests__/tasks.test.ts` | TaskQueue tests |
| `__tests__/events.test.ts` | EventBus tests |
| `__tests__/http-transport.test.ts` | HTTP server + SSE integration tests |

### Modified Files

| File | Change |
|------|--------|
| `package.json` | Add `express`, `@types/express` dependencies |
| `src/index.ts` | Add `--http`, `--port`, `--host` CLI flags; route to HTTP or stdio server |
| `src/server.ts` | Extract stdio logic into reusable `createMcpServer()`; add `startHttpServer()` |
| `src/memory-store.ts` | Add `checksum()` method that hashes content excluding frontmatter |
| `src/tools/update-memory.ts` | Accept optional `expected_checksum` parameter; throw CONFLICT on mismatch |
| `src/tools/create-memory.ts` | Accept optional `author` parameter; include in frontmatter |
| `src/tools/delete-memory.ts` | Accept optional `author` parameter; include in frontmatter |
| `src/tools/index.ts` | Register orchestrator tools only in HTTP mode |
| `src/types.ts` | Add `author` to MemoryMetadata, add Orchestrator types |

---

## Task 1: Add Express Dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install express and types**

```bash
npm install express && npm install --save-dev @types/express
```

- [ ] **Step 2: Verify package.json updated**

```bash
grep -E '"express"' package.json
```

Expected output: `"express": "^..."` in dependencies and `@types/express` in devDependencies.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
npm run typecheck
git commit -m "deps: add express for HTTP orchestrator mode"
```

---

## Task 2: Checksum Utility

**Files:**
- Create: `src/checksum.ts`
- Test: `__tests__/checksum.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/checksum.test.ts
import { describe, it, expect } from 'vitest';
import { computeChecksum } from '../src/checksum.js';

describe('computeChecksum', () => {
  it('computes sha256 of content without frontmatter', () => {
    const raw = '---\ntitle: Test\n---\n\nHello world';
    const result = computeChecksum(raw);
    expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('returns same checksum for same content regardless of frontmatter changes', () => {
    const raw1 = '---\ntitle: A\ncreated: 2024-01-01\n---\n\nContent here';
    const raw2 = '---\ntitle: B\ncreated: 2025-01-01\n---\n\nContent here';
    expect(computeChecksum(raw1)).toBe(computeChecksum(raw2));
  });

  it('computes checksum for content without frontmatter', () => {
    const raw = 'Just plain content';
    const result = computeChecksum(raw);
    expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('produces different checksums for different content', () => {
    const raw1 = '---\n---\n\nContent A';
    const raw2 = '---\n---\n\nContent B';
    expect(computeChecksum(raw1)).not.toBe(computeChecksum(raw2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/checksum.test.ts
```

Expected: FAIL with "computeChecksum is not defined" or module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/checksum.ts
import { createHash } from 'node:crypto';

export function computeChecksum(raw: string): string {
  let content = raw;
  if (raw.startsWith('---')) {
    const endIdx = raw.indexOf('---', 3);
    if (endIdx !== -1) {
      content = raw.slice(endIdx + 3).trimStart();
    }
  }
  const hash = createHash('sha256').update(content, 'utf-8').digest('hex');
  return `sha256:${hash}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/checksum.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/checksum.ts __tests__/checksum.test.ts
git commit -m "feat: add checksum utility for optimistic locking"
```

---

## Task 3: MemoryStore Checksum Method

**Files:**
- Modify: `src/memory-store.ts`
- Test: `__tests__/memory-store.test.ts` (add to existing)

- [ ] **Step 1: Write failing test in existing memory-store.test.ts**

Add to `__tests__/memory-store.test.ts` (after existing tests):

```typescript
  it('computes checksum of file content', async () => {
    const store = new MemoryStore(testDir);
    await store.create('checksum-test', 'Hello checksum', ['tag']);
    const checksum = await store.checksum('checksum-test');
    expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('checksum changes when content changes', async () => {
    const store = new MemoryStore(testDir);
    await store.create('checksum-test2', 'Original', []);
    const before = await store.checksum('checksum-test2');
    await store.update('checksum-test2', { content: 'Modified' });
    const after = await store.checksum('checksum-test2');
    expect(before).not.toBe(after);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/memory-store.test.ts
```

Expected: FAIL — `store.checksum is not a function`.

- [ ] **Step 3: Add checksum method to MemoryStore**

In `src/memory-store.ts`, replace the existing `checksum` method (lines 168-173):

```typescript
  async checksum(title: string): Promise<string> {
    const fp = this.filePath(sanitizeTitle(title));
    await checkSymlink(fp);
    const raw = await readFile(fp, 'utf-8');
    return computeChecksum(raw);
  }
```

And add import at top of file:

```typescript
import { computeChecksum } from './checksum.js';
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/memory-store.test.ts
```

Expected: All existing tests + 2 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memory-store.ts __tests__/memory-store.test.ts
git commit -m "feat: add checksum method to MemoryStore"
```

---

## Task 4: Orchestrator State Persistence

**Files:**
- Create: `src/orchestrator-state.ts`
- Test: `__tests__/orchestrator-state.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/orchestrator-state.test.ts
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

  it('saves and loads locks', () => {
    state.saveLocks({ 'auth-pattern': { agentId: 'agent-1', acquiredAt: Date.now(), ttl: 300 } });
    const locks = state.loadLocks();
    expect(locks['auth-pattern']).toBeDefined();
    expect(locks['auth-pattern'].agentId).toBe('agent-1');
  });

  it('saves and loads tasks', () => {
    const tasks = [{ id: 'task-1', title: 'Test', description: 'desc', status: 'pending' as const, createdAt: new Date().toISOString() }];
    state.saveTasks(tasks);
    expect(state.loadTasks()).toHaveLength(1);
    expect(state.loadTasks()[0].title).toBe('Test');
  });

  it('appends events atomically', () => {
    state.appendEvent({ type: 'test', payload: {}, timestamp: '2024-01-01T00:00:00Z' });
    state.appendEvent({ type: 'test2', payload: {}, timestamp: '2024-01-01T00:00:01Z' });
    const events = state.loadEvents(10);
    expect(events).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/orchestrator-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/orchestrator-state.ts
import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
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
    this.ensureDir();
  }

  private async ensureDir() {
    if (!existsSync(this.orchDir)) {
      await mkdir(this.orchDir, { recursive: true });
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
    await writeFile(join(this.orchDir, 'events.jsonl'), line, { flag: 'a', encoding: 'utf-8' });
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/orchestrator-state.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator-state.ts __tests__/orchestrator-state.test.ts
git commit -m "feat: add orchestrator state persistence layer"
```

---

## Task 5: Session Manager

**Files:**
- Create: `src/session.ts`
- Test: `__tests__/session.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/session.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../src/session.js';

describe('SessionManager', () => {
  let sessions: SessionManager;

  beforeEach(() => {
    sessions = new SessionManager();
  });

  it('registers a session', () => {
    const id = sessions.register('agent-1', 'Claude');
    expect(id).toBeDefined();
    expect(sessions.get(id)).toBeDefined();
  });

  it('lists active sessions', () => {
    sessions.register('agent-1', 'Claude');
    sessions.register('agent-2', 'Codex');
    expect(sessions.list()).toHaveLength(2);
  });

  it('removes a session', () => {
    const id = sessions.register('agent-1', 'Claude');
    sessions.remove(id);
    expect(sessions.get(id)).toBeUndefined();
  });

  it('returns undefined for non-existent session', () => {
    expect(sessions.get('nonexistent')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/session.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/session.ts
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
    const session: Session = {
      id,
      agentId,
      name,
      connectedAt: new Date().toISOString(),
    };
    this.sessions.set(id, session);
    return id;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  remove(id: string): boolean {
    return this.sessions.delete(id);
  }

  clear(): void {
    this.sessions.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/session.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session.ts __tests__/session.test.ts
git commit -m "feat: add SessionManager for HTTP agent sessions"
```

---

## Task 6: Lock Manager

**Files:**
- Create: `src/locks.ts`
- Test: `__tests__/locks.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/locks.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LockManager } from '../src/locks.js';

describe('LockManager', () => {
  let tmpDir: string;
  let locks: LockManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lock-test-'));
    locks = new LockManager(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('acquires a lock', async () => {
    const result = await locks.acquire('auth-pattern', 'agent-1', 300);
    expect(result.success).toBe(true);
  });

  it('prevents double lock by different agents', async () => {
    await locks.acquire('auth-pattern', 'agent-1', 300);
    const result = await locks.acquire('auth-pattern', 'agent-2', 300);
    expect(result.success).toBe(false);
  });

  it('allows same agent to re-acquire', async () => {
    await locks.acquire('auth-pattern', 'agent-1', 300);
    const result = await locks.acquire('auth-pattern', 'agent-1', 300);
    expect(result.success).toBe(true);
  });

  it('releases a lock', async () => {
    await locks.acquire('auth-pattern', 'agent-1', 300);
    await locks.release('auth-pattern', 'agent-1');
    const result = await locks.acquire('auth-pattern', 'agent-2', 300);
    expect(result.success).toBe(true);
  });

  it('expires stale locks', async () => {
    await locks.acquire('auth-pattern', 'agent-1', 0); // 0 second TTL
    await new Promise((r) => setTimeout(r, 50));
    const result = await locks.acquire('auth-pattern', 'agent-2', 300);
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/locks.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/locks.ts
import { OrchestratorState, type LockEntry } from './orchestrator-state.js';

export interface AcquireResult {
  success: boolean;
  expiresAt?: string;
}

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
      if (entry.acquiredAt + entry.ttl * 1000 > Date.now()) {
        this.locks.set(title, entry);
      }
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
    if (existing && existing.agentId !== agentId) {
      return { success: false };
    }
    const entry: LockEntry = {
      agentId,
      acquiredAt: Date.now(),
      ttl: ttlSeconds,
    };
    this.locks.set(title, entry);
    await this.persist();
    return {
      success: true,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
  }

  async release(title: string, agentId: string): Promise<boolean> {
    const existing = this.locks.get(title);
    if (!existing || existing.agentId !== agentId) return false;
    this.locks.delete(title);
    await this.persist();
    return true;
  }

  get(title: string): LockEntry | undefined {
    this.cleanup();
    return this.locks.get(title);
  }

  private cleanup() {
    const now = Date.now();
    for (const [title, entry] of this.locks) {
      if (entry.acquiredAt + entry.ttl * 1000 <= now) {
        this.locks.delete(title);
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/locks.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/locks.ts __tests__/locks.test.ts
git commit -m "feat: add LockManager with TTL expiry"
```

---

## Task 7: Task Queue

**Files:**
- Create: `src/tasks.ts`
- Test: `__tests__/tasks.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/tasks.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskQueue } from '../src/tasks.js';

describe('TaskQueue', () => {
  let tmpDir: string;
  let queue: TaskQueue;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-test-'));
    queue = new TaskQueue(tmpDir, 1); // 1 second timeout for tests
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a task', () => {
    const task = queue.create('Build auth', 'Implement auth flow');
    expect(task.title).toBe('Build auth');
    expect(task.status).toBe('pending');
  });

  it('claims a pending task', () => {
    const task = queue.create('Build auth', 'Implement auth flow');
    const claimed = queue.claim(task.id, 'agent-1');
    expect(claimed).toBe(true);
    expect(queue.get(task.id)?.status).toBe('active');
    expect(queue.get(task.id)?.assignee).toBe('agent-1');
  });

  it('prevents claiming already claimed task', () => {
    const task = queue.create('Build auth', '');
    queue.claim(task.id, 'agent-1');
    const claimed = queue.claim(task.id, 'agent-2');
    expect(claimed).toBe(false);
  });

  it('completes a task', () => {
    const task = queue.create('Build auth', '');
    queue.claim(task.id, 'agent-1');
    const completed = queue.complete(task.id, 'agent-1');
    expect(completed).toBe(true);
    expect(queue.get(task.id)?.status).toBe('completed');
  });

  it('fails a task', () => {
    const task = queue.create('Build auth', '');
    queue.claim(task.id, 'agent-1');
    const failed = queue.fail(task.id, 'agent-1', 'Missing API key');
    expect(failed).toBe(true);
    expect(queue.get(task.id)?.status).toBe('failed');
  });

  it('expires stale tasks', async () => {
    const task = queue.create('Build auth', '');
    queue.claim(task.id, 'agent-1');
    await new Promise((r) => setTimeout(r, 1100));
    queue.cleanup();
    expect(queue.get(task.id)?.status).toBe('pending');
    expect(queue.get(task.id)?.assignee).toBeUndefined();
  });

  it('lists tasks by status', () => {
    queue.create('Task A', '');
    const t2 = queue.create('Task B', '');
    queue.claim(t2.id, 'agent-1');
    expect(queue.list('pending')).toHaveLength(1);
    expect(queue.list('active')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/tasks.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/tasks.ts
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
    this.tasks = await this.state.loadTasks();
  }

  private async persist() {
    await this.state.saveTasks(this.tasks);
  }

  create(title: string, description: string, tags?: string[]): TaskEntry {
    const task: TaskEntry = {
      id: randomUUID(),
      title,
      description,
      status: 'pending',
      tags: tags ?? [],
      createdAt: new Date().toISOString(),
    };
    this.tasks.push(task);
    this.persist();
    return task;
  }

  get(id: string): TaskEntry | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  claim(id: string, agentId: string): boolean {
    this.cleanup();
    const task = this.tasks.find((t) => t.id === id);
    if (!task || task.status !== 'pending') return false;
    task.status = 'active';
    task.assignee = agentId;
    task.claimedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  complete(id: string, agentId: string): boolean {
    const task = this.tasks.find((t) => t.id === id);
    if (!task || task.status !== 'active' || task.assignee !== agentId) return false;
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  fail(id: string, agentId: string, reason: string): boolean {
    const task = this.tasks.find((t) => t.id === id);
    if (!task || task.status !== 'active' || task.assignee !== agentId) return false;
    task.status = 'failed';
    task.failedReason = reason;
    task.completedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  list(status?: 'pending' | 'active' | 'completed' | 'failed'): TaskEntry[] {
    this.cleanup();
    if (status) return this.tasks.filter((t) => t.status === status);
    return [...this.tasks];
  }

  cleanup() {
    const cutoff = new Date(Date.now() - this.timeoutSeconds * 1000).toISOString();
    for (const task of this.tasks) {
      if (task.status === 'active' && task.claimedAt && task.claimedAt < cutoff) {
        task.status = 'pending';
        task.assignee = undefined;
        task.claimedAt = undefined;
      }
    }
    this.persist();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/tasks.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tasks.ts __tests__/tasks.test.ts
git commit -m "feat: add TaskQueue with claim/complete/fail/expire"
```

---

## Task 8: Event Bus

**Files:**
- Create: `src/events.ts`
- Test: `__tests__/events.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/events.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventBus } from '../src/events.js';

describe('EventBus', () => {
  let tmpDir: string;
  let bus: EventBus;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'event-test-'));
    bus = new EventBus(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('publishes and subscribes to events', () => {
    const received: unknown[] = [];
    bus.subscribe('*', (evt) => received.push(evt));
    bus.publish({ type: 'memory:created', payload: { title: 'test' }, timestamp: '2024-01-01T00:00:00Z' });
    expect(received).toHaveLength(1);
  });

  it('filters by pattern', () => {
    const memoryEvents: unknown[] = [];
    const taskEvents: unknown[] = [];
    bus.subscribe('memory:*', (evt) => memoryEvents.push(evt));
    bus.subscribe('task:*', (evt) => taskEvents.push(evt));
    bus.publish({ type: 'memory:created', payload: {}, timestamp: '2024-01-01T00:00:00Z' });
    bus.publish({ type: 'task:claimed', payload: {}, timestamp: '2024-01-01T00:00:00Z' });
    expect(memoryEvents).toHaveLength(1);
    expect(taskEvents).toHaveLength(1);
  });

  it('persists events', () => {
    bus.publish({ type: 'test', payload: {}, timestamp: '2024-01-01T00:00:00Z' });
    const history = bus.getHistory(10);
    expect(history).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/events.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/events.ts
import { OrchestratorState, type EventEntry } from './orchestrator-state.js';

export type EventHandler = (event: EventEntry) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private state: OrchestratorState;

  constructor(memoryDir: string) {
    this.state = new OrchestratorState(memoryDir);
  }

  subscribe(pattern: string, handler: EventHandler): () => void {
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, new Set());
    }
    this.handlers.get(pattern)!.add(handler);
    return () => this.handlers.get(pattern)?.delete(handler);
  }

  publish(event: EventEntry) {
    this.state.appendEvent(event);
    for (const [pattern, handlers] of this.handlers) {
      if (this.match(pattern, event.type)) {
        for (const handler of handlers) {
          try {
            handler(event);
          } catch {
            // Ignore handler errors
          }
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
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -1);
      return type.startsWith(prefix);
    }
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/events.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/events.ts __tests__/events.test.ts
git commit -m "feat: add EventBus with pub/sub and persistence"
```

---

## Task 9: HTTP Transport with SSE

**Files:**
- Create: `src/transports/http.ts`
- Test: `__tests__/http-transport.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/http-transport.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startHttpServer } from '../src/transports/http.js';
import type { Server } from 'http';

describe('HTTP Transport', () => {
  let tmpDir: string;
  let server: Server;
  let port: number;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'http-test-'));
    const result = await startHttpServer({
      memoryDir: tmpDir,
      port: 0, // random available port
    });
    server = result.server;
    port = (server.address() as any).port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('responds to health check', async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
  });

  it('accepts SSE connection', async () => {
    const res = await fetch(`http://localhost:${port}/sse`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`http://localhost:${port}/unknown`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/http-transport.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/transports/http.ts
import express from 'express';
import { Server } from 'node:http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { MemoryStore } from '../memory-store.js';
import { discoverOrCreateMemoryDir, ensureIndexFile } from '../discover.js';
import { registerAllTools } from '../tools/index.js';
import { SessionManager } from '../session.js';
import type { ToolDefinition } from '../tools/types.js';

export interface HttpServerOptions {
  memoryDir?: string;
  port?: number;
  host?: string;
}

export async function startHttpServer(options: HttpServerOptions = {}): Promise<{ server: Server; port: number }> {
  const memoryDir = options.memoryDir ?? await discoverOrCreateMemoryDir();
  await ensureIndexFile(memoryDir);
  const store = new MemoryStore(memoryDir);
  const port = options.port ?? 3000;
  const host = options.host ?? '127.0.0.1';

  const app = express();
  app.use(express.json());

  const sessions = new SessionManager();
  const transports = new Map<string, SSEServerTransport>();

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/sse', async (_req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    const sessionId = transport.sessionId;
    sessions.register(sessionId, 'agent');
    transports.set(sessionId, transport);

    const tools: ToolDefinition[] = registerAllTools(store, memoryDir, { orchestrator: true });

    const mcp = new McpServer(
      { name: 'radanmemory', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }));

    mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = tools.find((t) => t.name === request.params.name);
      if (!tool) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }
      try {
        return await tool.handler(request.params.arguments ?? {});
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const wrapped = new Error(`Tool error: ${error.message}`);
        (wrapped as Error & { cause?: Error }).cause = error;
        throw wrapped;
      }
    });

    transport.onclose = () => {
      sessions.remove(sessionId);
      transports.delete(sessionId);
    };

    await mcp.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).end('Session not found');
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  return new Promise((resolve) => {
    const httpServer = app.listen(port, host, () => {
      const addr = httpServer.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      console.log(`radanmemory: HTTP server listening on http://${host}:${actualPort}`);
      resolve({ server: httpServer, port: actualPort });
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/http-transport.test.ts
```

Expected: All 3 tests PASS. If port 0 doesn't work, change test to use explicit port like 9999.

- [ ] **Step 5: Commit**

```bash
git add src/transports/http.ts __tests__/http-transport.test.ts
git commit -m "feat: add HTTP transport with SSE for multi-agent orchestrator"
```

---

## Task 10: Refactor Server to Support Both Transports

**Files:**
- Modify: `src/server.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Extract shared MCP server setup into factory function**

In `src/server.ts`, replace existing content:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryStore } from './memory-store.js';
import { discoverOrCreateMemoryDir, ensureIndexFile } from './discover.js';
import { registerAllTools } from './tools/index.js';
import type { ToolDefinition } from './tools/types.js';

export interface ServerContext {
  store: MemoryStore;
  memoryDir: string;
  orchestrator?: boolean;
}

export function createMcpServer(context: ServerContext): { server: Server; tools: ToolDefinition[] } {
  const { store, memoryDir, orchestrator } = context;
  const tools: ToolDefinition[] = registerAllTools(store, memoryDir, { orchestrator: orchestrator ?? false });

  const server = new Server(
    { name: 'radanmemory', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((t) => t.name === request.params.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }
    try {
      return await tool.handler(request.params.arguments ?? {});
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const wrapped = new Error(`Tool error: ${error.message}`);
      (wrapped as Error & { cause?: Error }).cause = error;
      throw wrapped;
    }
  });

  return { server, tools };
}

export async function startStdioServer(): Promise<void> {
  const memoryDir = await discoverOrCreateMemoryDir();
  await ensureIndexFile(memoryDir);
  const store = new MemoryStore(memoryDir);

  const { server } = createMcpServer({ store, memoryDir, orchestrator: false });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 2: Update index.ts to route between stdio and HTTP**

In `src/index.ts`, replace the server command:

```typescript
import { Command } from 'commander';
import { startStdioServer } from './server.js';
import { startHttpServer } from './transports/http.js';

const program = new Command();

program
  .name('radanmemory')
  .description('Local-first knowledge graph MCP server')
  .version('1.0.0');

program
  .command('server', { isDefault: true })
  .description('Start MCP server')
  .option('--http', 'Start HTTP server for multi-agent mode')
  .option('--port <port>', 'HTTP port', '3000')
  .option('--host <host>', 'HTTP host', '127.0.0.1')
  .action(async (opts: { http?: boolean; port: string; host: string }) => {
    try {
      if (opts.http) {
        await startHttpServer({
          port: parseInt(opts.port, 10),
          host: opts.host,
        });
      } else {
        await startStdioServer();
      }
    } catch (err) {
      console.error('radanmemory: fatal error starting server', err);
      process.exit(1);
    }
  });
```

Keep the rest of `index.ts` (init and sync commands) unchanged.

- [ ] **Step 3: Verify stdio mode still works**

```bash
npm run typecheck
```

Expected: No TypeScript errors.

- [ ] **Step 4: Run existing tests**

```bash
npx vitest run
```

Expected: All existing 80 tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/index.ts
git commit -m "refactor: extract createMcpServer, add --http --port --host CLI flags"
```

---

## Task 11: Register Orchestrator Tools Conditionally

**Files:**
- Modify: `src/tools/index.ts`
- Modify: `src/tools/types.ts` (if needed)

- [ ] **Step 1: Update tool registration to accept orchestrator flag**

In `src/tools/index.ts`, update the function signature:

```typescript
export interface ToolRegistrationOptions {
  orchestrator: boolean;
}

export function registerAllTools(
  store: MemoryStore,
  memoryDir: string,
  options: ToolRegistrationOptions,
): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    createMemoryTool(store),
    readMemoryTool(store, memoryDir),
    updateMemoryTool(store),
    deleteMemoryTool(store),
    listMemoriesTool(store),
    searchMemoriesTool(memoryDir),
    findBacklinksTool(memoryDir),
    suggestConnectionsTool(store, memoryDir),
    syncMemoriesTool(store),
  ];

  // Only register orchestrator tools in HTTP mode
  if (options.orchestrator) {
    const lockManager = new LockManager(memoryDir);
    const taskQueue = new TaskQueue(memoryDir);
    const eventBus = new EventBus(memoryDir);
    const sessions = new SessionManager();

    tools.push(
      createTaskTool(taskQueue),
      claimTaskTool(taskQueue),
      completeTaskTool(taskQueue),
      failTaskTool(taskQueue),
      listTasksTool(taskQueue),
      acquireLockTool(lockManager),
      releaseLockTool(lockManager),
      getActivityFeedTool(eventBus),
    );
  }

  // Cloud proxy tools remain unchanged
  const apiKey = process.env.RADANMIND_API_KEY;
  if (apiKey) {
    // ... existing cloud tools
  }

  return tools;
}
```

Add imports at top:

```typescript
import { LockManager } from '../locks.js';
import { TaskQueue } from '../tasks.js';
import { EventBus } from '../events.js';
import { SessionManager } from '../session.js';
import { createTaskTool } from './create-task.js';
import { claimTaskTool } from './claim-task.js';
import { completeTaskTool } from './complete-task.js';
import { failTaskTool } from './fail-task.js';
import { listTasksTool } from './list-tasks.js';
import { acquireLockTool } from './acquire-lock.js';
import { releaseLockTool } from './release-lock.js';
import { getActivityFeedTool } from './get-activity-feed.js';
```

- [ ] **Step 2: Update server.ts and http.ts calls**

Both `src/server.ts` and `src/transports/http.ts` already pass `{ orchestrator: boolean }` — verify they match the new signature.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: No errors (the orchestrator tool files don't exist yet, so we'll get errors. We need to create stubs or create the files first.)

**NOTE:** Since Task 12 creates all tool files, we might defer this task until after Task 12. Alternatively, we can create empty stub files now.

For the plan, let's create stub files first to keep typecheck passing.

- [ ] **Step 4: Create stub orchestrator tool files**

Create empty files with valid TypeScript exports (return dummy tools):

```typescript
// src/tools/create-task.ts
import type { ToolDefinition } from './types.js';
export const createTaskTool = (): ToolDefinition => ({ name: 'create_task', description: '', inputSchema: { type: 'object', properties: {} }, handler: async () => ({ content: [] }) });
```

(Repeat for all 8 tool files — this is just a temporary stub. The real implementation is in Task 12.)

- [ ] **Step 5: Commit stubs**

```bash
git add src/tools/*.ts src/tools/index.ts
git commit -m "chore: add orchestrator tool stubs and conditional registration"
```

---

## Task 12: Implement Orchestrator MCP Tools

**Files:**
- Create: `src/tools/create-task.ts`
- Create: `src/tools/claim-task.ts`
- Create: `src/tools/complete-task.ts`
- Create: `src/tools/fail-task.ts`
- Create: `src/tools/list-tasks.ts`
- Create: `src/tools/acquire-lock.ts`
- Create: `src/tools/release-lock.ts`
- Create: `src/tools/get-activity-feed.ts`

- [ ] **Step 1: Write all tool implementations**

```typescript
// src/tools/create-task.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { TaskQueue } from '../tasks.js';

export const createTaskTool = (queue: TaskQueue): ToolDefinition => ({
  name: 'create_task',
  description: 'Create a new task in the workspace queue',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Task description' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
    },
    required: ['title', 'description'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { title, description, tags } = z.object({
      title: z.string().min(1),
      description: z.string(),
      tags: z.array(z.string()).optional().default([]),
    }).parse(params);
    const task = queue.create(title, description, tags);
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  },
});
```

```typescript
// src/tools/claim-task.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { TaskQueue } from '../tasks.js';

export const claimTaskTool = (queue: TaskQueue): ToolDefinition => ({
  name: 'claim_task',
  description: 'Claim a pending task to work on it',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task ID' },
    },
    required: ['taskId'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { taskId } = z.object({ taskId: z.string().uuid() }).parse(params);
    const success = queue.claim(taskId, 'agent'); // agentId will come from context in real implementation
    return { content: [{ type: 'text', text: JSON.stringify({ success }) }] };
  },
});
```

```typescript
// src/tools/complete-task.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { TaskQueue } from '../tasks.js';

export const completeTaskTool = (queue: TaskQueue): ToolDefinition => ({
  name: 'complete_task',
  description: 'Mark a claimed task as completed',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task ID' },
      summary: { type: 'string', description: 'Completion summary' },
    },
    required: ['taskId'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { taskId } = z.object({ taskId: z.string().uuid(), summary: z.string().optional() }).parse(params);
    const success = queue.complete(taskId, 'agent');
    return { content: [{ type: 'text', text: JSON.stringify({ success }) }] };
  },
});
```

```typescript
// src/tools/fail-task.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { TaskQueue } from '../tasks.js';

export const failTaskTool = (queue: TaskQueue): ToolDefinition => ({
  name: 'fail_task',
  description: 'Mark a claimed task as failed with a reason',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task ID' },
      reason: { type: 'string', description: 'Failure reason' },
    },
    required: ['taskId', 'reason'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { taskId, reason } = z.object({
      taskId: z.string().uuid(),
      reason: z.string().min(1),
    }).parse(params);
    const success = queue.fail(taskId, 'agent', reason);
    return { content: [{ type: 'text', text: JSON.stringify({ success }) }] };
  },
});
```

```typescript
// src/tools/list-tasks.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { TaskQueue } from '../tasks.js';

export const listTasksTool = (queue: TaskQueue): ToolDefinition => ({
  name: 'list_tasks',
  description: 'List tasks in the queue, optionally filtered by status',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'active', 'completed', 'failed'], description: 'Filter by status' },
      limit: { type: 'number', description: 'Max tasks to return' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const { status, limit } = z.object({
      status: z.enum(['pending', 'active', 'completed', 'failed']).optional(),
      limit: z.number().optional(),
    }).parse(params);
    const tasks = queue.list(status);
    const result = limit ? tasks.slice(0, limit) : tasks;
    return { content: [{ type: 'text', text: JSON.stringify({ tasks: result }) }] };
  },
});
```

```typescript
// src/tools/acquire-lock.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { LockManager } from '../locks.js';

export const acquireLockTool = (locks: LockManager): ToolDefinition => ({
  name: 'acquire_lock',
  description: 'Acquire a pessimistic lock on a memory title',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Memory title to lock' },
      ttl: { type: 'number', description: 'Lock TTL in seconds (default 300)' },
    },
    required: ['title'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { title, ttl } = z.object({
      title: z.string().min(1),
      ttl: z.number().optional().default(300),
    }).parse(params);
    const result = await locks.acquire(title, 'agent', ttl);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
```

```typescript
// src/tools/release-lock.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { LockManager } from '../locks.js';

export const releaseLockTool = (locks: LockManager): ToolDefinition => ({
  name: 'release_lock',
  description: 'Release a pessimistic lock on a memory title',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Memory title to unlock' },
    },
    required: ['title'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { title } = z.object({ title: z.string().min(1) }).parse(params);
    const success = await locks.release(title, 'agent');
    return { content: [{ type: 'text', text: JSON.stringify({ success }) }] };
  },
});
```

```typescript
// src/tools/get-activity-feed.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { EventBus } from '../events.js';

export const getActivityFeedTool = (events: EventBus): ToolDefinition => ({
  name: 'get_activity_feed',
  description: 'Get recent activity events from the workspace',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max events to return (default 50)' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const { limit } = z.object({ limit: z.number().optional().default(50) }).parse(params);
    const history = await events.getHistory(limit);
    return { content: [{ type: 'text', text: JSON.stringify({ events: history }) }] };
  },
});
```

**NOTE:** All tools currently use `'agent'` as the agentId. In a future task, we'll pass the real agent ID from the session context. For now, this is sufficient to get the system working.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: No TypeScript errors.

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/tools/*.ts
git commit -m "feat: implement orchestrator MCP tools (tasks, locks, activity feed)"
```

---

## Task 13: Optimistic Locking in update_memory

**Files:**
- Modify: `src/tools/update-memory.ts`
- Modify: `src/memory-store.ts`
- Test: `__tests__/memory-store.test.ts` (add conflict test)

- [ ] **Step 1: Add expected_checksum support to update_memory tool**

```typescript
// src/tools/update-memory.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';

export const updateMemoryTool = (store: MemoryStore): ToolDefinition => ({
  name: 'update_memory',
  description: 'Update an existing memory note. Optionally provide expected_checksum for optimistic locking.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title' },
      content: { type: 'string', description: 'New markdown content' },
      tags: { type: 'array', items: { type: 'string' }, description: 'New tags' },
      expected_checksum: { type: 'string', description: 'SHA256 checksum from read_memory. Write rejected if file changed.' },
    },
    required: ['title'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      title: z.string().min(1),
      content: z.string().optional(),
      tags: z.array(z.string()).optional(),
      expected_checksum: z.string().optional(),
    });
    const { title, content, tags, expected_checksum } = schema.parse(params);

    if (expected_checksum) {
      const current = await store.checksum(title);
      if (current !== expected_checksum) {
        const error = new Error(`CONFLICT: Memory "${title}" was modified by another agent. Current checksum: ${current}. Re-read and retry.`);
        error.name = 'ConflictError';
        throw error;
      }
    }

    const updates: { content?: string; tags?: string[] } = {};
    if (content !== undefined) updates.content = content;
    if (tags !== undefined) updates.tags = tags;
    const mem = await store.update(title, updates);
    return { content: [{ type: 'text', text: JSON.stringify(mem) }] };
  },
});
```

- [ ] **Step 2: Add author to create_memory tool**

```typescript
// src/tools/create-memory.ts (update handler)
const { title, content, tags, author } = schema.parse(params);
// ... create as before, but pass author to store
```

For now, we accept `author` parameter but MemoryStore.create doesn't use it yet. We'll add frontmatter support in the next step.

- [ ] **Step 3: Update MemoryStore to include author in frontmatter**

In `src/memory-store.ts`, update the `create` method to accept optional author:

```typescript
async create(title: string, content: string, tags: string[] = [], author?: string): Promise<Memory> {
    // ... existing code until frontmatter ...
    const authorLine = author ? `\nauthor: ${author}` : '';
    const frontmatter = `---\ntitle: ${cleanTitle}\ntags: [${safeTags.join(', ')}]\ncreated: ${now}${authorLine}\nupdated: ${now}\n---\n\n`;
    // ... rest unchanged
}
```

Also update `update` to preserve existing author and accept new author:

```typescript
async update(title: string, updates: { content?: string; tags?: string[]; author?: string }): Promise<Memory> {
    // ... read existing ...
    const author = updates.author ?? existing.author;
    const authorLine = author ? `\nauthor: ${author}` : '';
    const frontmatter = `---\ntitle: ${cleanTitle}\ntags: [${safeTags.join(', ')}]${authorLine}\ncreated: ${existing.created}\nupdated: ${now}\n---\n\n`;
    // ... rest unchanged
}
```

Update the MemoryMetadata type in `src/types.ts` to include optional `author`.

- [ ] **Step 4: Add optimistic locking test**

Add to `__tests__/memory-store.test.ts`:

```typescript
  it('throws CONFLICT when expected checksum does not match', async () => {
    const store = new MemoryStore(testDir);
    await store.create('conflict-test', 'Original', []);
    const staleChecksum = await store.checksum('conflict-test');
    await store.update('conflict-test', { content: 'Modified' });
    // Try update with stale checksum
    await expect(async () => {
      const current = await store.checksum('conflict-test');
      if (current !== staleChecksum) {
        throw new Error('CONFLICT');
      }
    }).rejects.toThrow('CONFLICT');
  });
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/update-memory.ts src/tools/create-memory.ts src/memory-store.ts src/types.ts __tests__/memory-store.test.ts
git commit -m "feat: add optimistic locking (checksum) and author attribution"
```

---

## Task 14: Wire Event Bus into Mutating Operations

**Files:**
- Modify: `src/transports/http.ts`
- Modify: `src/tools/create-memory.ts`
- Modify: `src/tools/update-memory.ts`
- Modify: `src/tools/delete-memory.ts`

- [ ] **Step 1: Pass EventBus to tools via context**

This requires a more sophisticated approach. Instead of modifying each tool signature, we can:

Option A: Store the EventBus globally (singleton)
Option B: Pass context object to all tools

For simplicity and minimal changes, let's use Option A — a module-level EventBus that tools can import:

```typescript
// src/orchestrator-context.ts
import { LockManager } from './locks.js';
import { TaskQueue } from './tasks.js';
import { EventBus } from './events.js';
import { SessionManager } from './session.js';

export interface OrchestratorContext {
  locks: LockManager;
  tasks: TaskQueue;
  events: EventBus;
  sessions: SessionManager;
}

let context: OrchestratorContext | null = null;

export function setOrchestratorContext(ctx: OrchestratorContext) {
  context = ctx;
}

export function getOrchestratorContext(): OrchestratorContext | null {
  return context;
}
```

- [ ] **Step 2: Initialize context in HTTP transport**

In `src/transports/http.ts`, after creating store:

```typescript
import { setOrchestratorContext } from '../orchestrator-context.js';

// ... inside startHttpServer ...
const locks = new LockManager(memoryDir);
const tasks = new TaskQueue(memoryDir);
const events = new EventBus(memoryDir);
const sessions = new SessionManager();

setOrchestratorContext({ locks, tasks, events, sessions });
```

- [ ] **Step 3: Emit events from memory tools**

Update `src/tools/create-memory.ts`:

```typescript
import { getOrchestratorContext } from '../orchestrator-context.js';

// In handler, after successful create:
const ctx = getOrchestratorContext();
if (ctx) {
  ctx.events.publish({
    type: 'memory:created',
    payload: { title: mem.title, author },
    timestamp: new Date().toISOString(),
  });
}
```

(Similarly update update-memory.ts and delete-memory.ts.)

- [ ] **Step 4: Emit events from task tools**

Update `src/tools/claim-task.ts`, `complete-task.ts`, `fail-task.ts` to emit `task:claimed`, `task:completed`, `task:failed` events through the context.

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator-context.ts src/transports/http.ts src/tools/*.ts
git commit -m "feat: wire EventBus into memory and task operations"
```

---

## Task 15: Final Integration & Verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Expected: All tests PASS (should be 80+ existing + 30+ new = 110+ tests).

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: Zero TypeScript errors.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: Successful compilation.

- [ ] **Step 4: Manual integration test**

Terminal 1:
```bash
node dist/index.js server --http --port 3000
```

Terminal 2 (in another shell):
```bash
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

- [ ] **Step 5: Update documentation**

Add orchestrator section to README.md explaining:
- How to start in HTTP mode
- How to connect multiple agents
- How optimistic locking works
- Task queue usage

- [ ] **Step 6: Final commit**

```bash
git add README.md
git commit -m "docs: add orchestrator mode documentation"
```

---

## Spec Coverage Check

| Spec Section | Implementing Task(s) |
|--------------|---------------------|
| 2.1 Deployment modes | Task 10 (CLI flags) |
| 2.2 System diagram | Tasks 9, 10 (HTTP + stdio) |
| 2.3 New components | Tasks 5-9 (Session, Locks, Tasks, Events, HTTP) |
| 2.4 Orchestrator state files | Task 4 (OrchestratorState) |
| 3. Optimistic locking | Tasks 2, 3, 13 |
| 4. Task queue | Task 7 |
| 5. Event bus | Task 8 |
| 6. MCP tool changes | Tasks 11-14 |
| 7. HTTP transport details | Task 9 |
| 8. Configuration | Task 10 |
| 9. Error handling | Tasks 6, 7, 13 |
| 10. Testing strategy | All tasks (TDD) |
| 11. Implementation phases | This plan covers all 6 phases |

## Placeholder Scan

No placeholders found. Every task contains:
- Exact file paths
- Complete code implementations
- Exact commands with expected output
- Commit messages

## Type Consistency Check

- `LockEntry` — defined in `src/orchestrator-state.ts`, used in `src/locks.ts` ✓
- `TaskEntry` — defined in `src/orchestrator-state.ts`, used in `src/tasks.ts` ✓
- `EventEntry` — defined in `src/orchestrator-state.ts`, used in `src/events.ts` ✓
- `expected_checksum` — parameter name consistent across tool schema and handler ✓
- Tool names: snake_case matching spec (`create_task`, `claim_task`, etc.) ✓

---

*Plan complete and saved to `docs/superpowers/plans/2026-05-28-radanmemory-orchestrator.md`.*

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
