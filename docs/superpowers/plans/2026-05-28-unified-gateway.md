# RadanMemory Unified Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RadanMemory će postati Unified MCP Gateway — lokalne memorije + proxy ka RadanMind cloud-u (projects, tasks, agents).

**Architecture:** Novi `RadanMindProxy` client šalje JSON-RPC 2.0 pozive ka `/api/mcp`. `CloudCache` lokalno kešira cloud podatke. Tool handleri za project/task/agent prosleđuju ka proxy-u. AI agent vidi samo RadanMemory MCP server.

**Tech Stack:** Node.js, TypeScript, @modelcontextprotocol/sdk, native fetch, JSON-RPC 2.0

---

## File Structure

**New files:**
- `src/radanmind-proxy.ts` — HTTP JSON-RPC 2.0 client za RadanMind
- `src/cloud-cache.ts` — lokalni file-based cache za cloud podatke
- `src/tools/create-project.ts` — MCP tool: kreira project na cloud-u
- `src/tools/list-projects.ts` — MCP tool: lista projects sa keša
- `src/tools/search-projects.ts` — MCP tool: pretražuje projects
- `src/tools/update-project.ts` — MCP tool: ažurira project
- `src/tools/delete-project.ts` — MCP tool: briše project
- `src/tools/create-task.ts` — MCP tool: kreira task
- `src/tools/list-tasks.ts` — MCP tool: lista tasks
- `src/tools/search-tasks.ts` — MCP tool: pretražuje tasks
- `src/tools/get-task.ts` — MCP tool: čita task
- `src/tools/update-task.ts` — MCP tool: ažurira task
- `src/tools/delete-task.ts` — MCP tool: briše task
- `src/tools/create-agent.ts` — MCP tool: kreira agenta
- `src/tools/list-agents.ts` — MCP tool: lista agente
- `src/tools/get-agent.ts` — MCP tool: čita agenta
- `src/tools/update-agent.ts` — MCP tool: ažurira agenta
- `src/tools/delete-agent.ts` — MCP tool: briše agenta
- `__tests__/radanmind-proxy.test.ts` — testovi za proxy client
- `__tests__/cloud-cache.test.ts` — testovi za cache

**Modified files:**
- `src/tools/index.ts` — registruje nove tool-ove
- `README.md` — dokumentuje nove alate

---

### Task 1: RadanMindProxy Client

**Files:**
- Create: `src/radanmind-proxy.ts`
- Create: `__tests__/radanmind-proxy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RadanMindProxy } from '../src/radanmind-proxy.js';

describe('RadanMindProxy', () => {
  const mockEndpoint = 'https://mock.radanmind.com/api/mcp';
  const mockApiKey = 'rm_live_test123';

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws without apiKey', () => {
    expect(() => new RadanMindProxy({ endpoint: mockEndpoint, apiKey: '' })).toThrow('apiKey');
  });

  it('calls fetch with correct JSON-RPC payload', async () => {
    const proxy = new RadanMindProxy({ endpoint: mockEndpoint, apiKey: mockApiKey });
    
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jsonrpc: '2.0', result: { id: '123' }, id: 1 }),
    } as Response);

    await proxy.call('tools/call', { name: 'create_project', arguments: { name: 'Test' } });

    expect(global.fetch).toHaveBeenCalledWith(
      mockEndpoint,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer rm_live_test123',
        }),
        body: expect.stringContaining('"method":"tools/call"'),
      })
    );
  });

  it('returns result from JSON-RPC response', async () => {
    const proxy = new RadanMindProxy({ endpoint: mockEndpoint, apiKey: mockApiKey });
    
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jsonrpc: '2.0', result: { id: '456' }, id: 1 }),
    } as Response);

    const result = await proxy.call('tools/call', { name: 'list_projects' });
    expect(result).toEqual({ id: '456' });
  });

  it('throws on JSON-RPC error', async () => {
    const proxy = new RadanMindProxy({ endpoint: mockEndpoint, apiKey: mockApiKey });
    
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid' }, id: 1 }),
    } as Response);

    await expect(proxy.call('tools/call', {})).rejects.toThrow('Invalid');
  });

  it('throws on HTTP error', async () => {
    const proxy = new RadanMindProxy({ endpoint: mockEndpoint, apiKey: mockApiKey });
    
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    } as Response);

    await expect(proxy.call('tools/call', {})).rejects.toThrow('Forbidden');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/radanmind-proxy.test.ts`
Expected: FAIL — `RadanMindProxy` not defined

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/radanmind-proxy.ts
const DEFAULT_ENDPOINT = 'https://radanmind.vercel.app/api/mcp';
const DEFAULT_TIMEOUT = 30_000;

export interface RadanMindConfig {
  endpoint?: string;
  apiKey: string;
  timeout?: number;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: string;
  result?: unknown;
  error?: { code: number; message: string };
  id: number;
}

export class RadanMindProxy {
  private endpoint: string;
  private apiKey: string;
  private timeout: number;
  private idCounter = 0;

  constructor(config: RadanMindConfig) {
    if (!config.apiKey) throw new Error('RadanMindProxy: apiKey is required');
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  async call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = ++this.idCounter;
    const body: JsonRpcRequest = { jsonrpc: '2.0', method, params, id };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`RadanMind error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as JsonRpcResponse;
      if (data.error) {
        throw new Error(`RadanMind error: ${data.error.code} ${data.error.message}`);
      }

      return data.result as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // Convenience wrappers
  async createProject(name: string, description?: string): Promise<unknown> {
    return this.call('tools/call', { name: 'create_project', arguments: { name, description } });
  }

  async listProjects(limit?: number): Promise<unknown[]> {
    return this.call('tools/call', { name: 'list_projects', arguments: { limit } }) as Promise<unknown[]>;
  }

  async searchProjects(query: string): Promise<unknown[]> {
    return this.call('tools/call', { name: 'search_projects', arguments: { query } }) as Promise<unknown[]>;
  }

  async updateProject(id: string, updates: { name?: string; description?: string }): Promise<unknown> {
    return this.call('tools/call', { name: 'update_project', arguments: { id, ...updates } });
  }

  async deleteProject(id: string): Promise<unknown> {
    return this.call('tools/call', { name: 'delete_project', arguments: { id } });
  }

  async createTask(projectId: string, instructions: string, taskKnowledge?: string, status?: string): Promise<unknown> {
    return this.call('tools/call', { name: 'create_task', arguments: { project_id: projectId, instructions, task_knowledge: taskKnowledge, status } });
  }

  async listTasks(projectId?: string, status?: string, limit?: number): Promise<unknown[]> {
    return this.call('tools/call', { name: 'list_tasks', arguments: { project_id: projectId, status, limit } }) as Promise<unknown[]>;
  }

  async searchTasks(query: string, projectId?: string, status?: string): Promise<unknown[]> {
    return this.call('tools/call', { name: 'search_tasks', arguments: { query, project_id: projectId, status } }) as Promise<unknown[]>;
  }

  async getTask(id: string): Promise<unknown> {
    return this.call('tools/call', { name: 'get_task', arguments: { id } });
  }

  async updateTask(id: string, updates: { instructions?: string; status?: string }): Promise<unknown> {
    return this.call('tools/call', { name: 'update_task', arguments: { id, ...updates } });
  }

  async deleteTask(id: string): Promise<unknown> {
    return this.call('tools/call', { name: 'delete_task', arguments: { id } });
  }

  async createAgent(projectId: string, name: string, systemPrompt: string): Promise<unknown> {
    return this.call('tools/call', { name: 'create_agent', arguments: { project_id: projectId, name, system_prompt: systemPrompt } });
  }

  async listAgents(projectId?: string, limit?: number): Promise<unknown[]> {
    return this.call('tools/call', { name: 'list_agents', arguments: { project_id: projectId, limit } }) as Promise<unknown[]>;
  }

  async getAgent(id: string): Promise<unknown> {
    return this.call('tools/call', { name: 'get_agent', arguments: { id } });
  }

  async updateAgent(id: string, updates: { name?: string; system_prompt?: string }): Promise<unknown> {
    return this.call('tools/call', { name: 'update_agent', arguments: { id, ...updates } });
  }

  async deleteAgent(id: string): Promise<unknown> {
    return this.call('tools/call', { name: 'delete_agent', arguments: { id } });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/radanmind-proxy.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/radanmind-proxy.ts __tests__/radanmind-proxy.test.ts
git commit -m "feat: add RadanMindProxy client with JSON-RPC 2.0 support"
```

---

### Task 2: Cloud Cache

**Files:**
- Create: `src/cloud-cache.ts`
- Create: `__tests__/cloud-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { CloudCache } from '../src/cloud-cache.js';

describe('CloudCache', () => {
  let cacheDir: string;
  let cache: CloudCache;

  beforeEach(async () => {
    cacheDir = join(tmpdir(), `radanmemory-cache-${randomUUID()}`);
    await mkdir(cacheDir, { recursive: true });
    cache = new CloudCache(cacheDir);
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('returns null when cache is empty', async () => {
    const projects = await cache.getProjects();
    expect(projects).toBeNull();
  });

  it('stores and retrieves projects', async () => {
    const data = [{ id: '1', name: 'Proj' }];
    await cache.setProjects(data);
    const retrieved = await cache.getProjects();
    expect(retrieved).toEqual(data);
  });

  it('stores tasks with projectId filter', async () => {
    const data = [{ id: 't1', project_id: 'p1' }];
    await cache.setTasks(data, 'p1');
    const retrieved = await cache.getTasks('p1');
    expect(retrieved).toEqual(data);
  });

  it('returns null for expired cache', async () => {
    const data = [{ id: '1', name: 'Proj' }];
    await cache.setProjects(data);
    // Fast-forward 6 minutes by modifying the mtime of the cache file
    const cacheFile = join(cacheDir, 'projects.json');
    const past = new Date(Date.now() - 6 * 60 * 1000);
    await writeFile(cacheFile, JSON.stringify({ data, timestamp: past.toISOString() }), 'utf-8');
    const retrieved = await cache.getProjects();
    expect(retrieved).toBeNull();
  });

  it('invalidate removes all cache files', async () => {
    await cache.setProjects([{ id: '1' }]);
    await cache.invalidate();
    const projects = await cache.getProjects();
    expect(projects).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/cloud-cache.test.ts`
Expected: FAIL — `CloudCache` not defined

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/cloud-cache.ts
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  timestamp: string;
  data: T;
}

export class CloudCache {
  private dir: string;

  constructor(memoryDir: string) {
    this.dir = join(memoryDir, '.cache');
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private async readCache<T>(filename: string): Promise<T | null> {
    try {
      const raw = await readFile(join(this.dir, filename), 'utf-8');
      const entry = JSON.parse(raw) as CacheEntry<T>;
      const age = Date.now() - new Date(entry.timestamp).getTime();
      if (age > CACHE_TTL_MS) return null;
      return entry.data;
    } catch {
      return null;
    }
  }

  private async writeCache<T>(filename: string, data: T): Promise<void> {
    await this.ensureDir();
    const entry: CacheEntry<T> = { timestamp: new Date().toISOString(), data };
    await writeFile(join(this.dir, filename), JSON.stringify(entry), 'utf-8');
  }

  async getProjects(): Promise<unknown[] | null> {
    return this.readCache<unknown[]>('projects.json');
  }

  async setProjects(projects: unknown[]): Promise<void> {
    await this.writeCache('projects.json', projects);
  }

  async getTasks(projectId?: string): Promise<unknown[] | null> {
    const filename = projectId ? `tasks-${projectId}.json` : 'tasks-all.json';
    return this.readCache<unknown[]>(filename);
  }

  async setTasks(tasks: unknown[], projectId?: string): Promise<void> {
    const filename = projectId ? `tasks-${projectId}.json` : 'tasks-all.json';
    await this.writeCache(filename, tasks);
  }

  async getAgents(projectId?: string): Promise<unknown[] | null> {
    const filename = projectId ? `agents-${projectId}.json` : 'agents-all.json';
    return this.readCache<unknown[]>(filename);
  }

  async setAgents(agents: unknown[], projectId?: string): Promise<void> {
    const filename = projectId ? `agents-${projectId}.json` : 'agents-all.json';
    await this.writeCache(filename, agents);
  }

  async invalidate(): Promise<void> {
    try {
      const files = await readdir(this.dir);
      await Promise.all(files.map(f => rm(join(this.dir, f))));
    } catch {
      // Dir doesn't exist, ok
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/cloud-cache.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/cloud-cache.ts __tests__/cloud-cache.test.ts
git commit -m "feat: add CloudCache with 5-min TTL for RadanMind data"
```

---

### Task 3: Project Tools

**Files:**
- Create: `src/tools/create-project.ts`
- Create: `src/tools/list-projects.ts`
- Create: `src/tools/search-projects.ts`
- Create: `src/tools/update-project.ts`
- Create: `src/tools/delete-project.ts`
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Write the tools**

```typescript
// src/tools/create-project.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const createProjectTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'create_project',
  description: 'Create a new project in RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Project name' },
      description: { type: 'string', description: 'Optional description' },
    },
    required: ['name'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ name: z.string().min(1), description: z.string().optional() });
    const { name, description } = schema.parse(params);
    const result = await proxy.createProject(name, description);
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
```

```typescript
// src/tools/list-projects.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const listProjectsTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'list_projects',
  description: 'List all projects from RadanMind (cached for 5 min)',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max results' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ limit: z.number().optional() });
    const { limit } = schema.parse(params);
    
    const cached = await cache.getProjects();
    if (cached) {
      return { content: [{ type: 'text', text: JSON.stringify({ cached: true, projects: limit ? cached.slice(0, limit) : cached }) }] };
    }
    
    const projects = await proxy.listProjects(limit);
    await cache.setProjects(projects);
    return { content: [{ type: 'text', text: JSON.stringify({ cached: false, projects }) }] };
  },
});
```

```typescript
// src/tools/search-projects.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';

export const searchProjectsTool = (proxy: RadanMindProxy): ToolDefinition => ({
  name: 'search_projects',
  description: 'Search projects in RadanMind by name or description',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ query: z.string().min(1) });
    const { query } = schema.parse(params);
    const results = await proxy.searchProjects(query);
    return { content: [{ type: 'text', text: JSON.stringify({ results }) }] };
  },
});
```

```typescript
// src/tools/update-project.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const updateProjectTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'update_project',
  description: 'Update an existing project in RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Project ID' },
      name: { type: 'string', description: 'New name' },
      description: { type: 'string', description: 'New description' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ id: z.string().uuid(), name: z.string().optional(), description: z.string().optional() });
    const { id, name, description } = schema.parse(params);
    const result = await proxy.updateProject(id, { name, description });
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
```

```typescript
// src/tools/delete-project.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const deleteProjectTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'delete_project',
  description: 'Delete a project from RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Project ID' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ id: z.string().uuid() });
    const { id } = schema.parse(params);
    await proxy.deleteProject(id);
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  },
});
```

- [ ] **Step 2: Register tools in index.ts**

Modify `src/tools/index.ts`:

```typescript
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';
import { createMemoryTool } from './create-memory.js';
// ... existing imports ...
import { createProjectTool } from './create-project.js';
import { listProjectsTool } from './list-projects.js';
import { searchProjectsTool } from './search-projects.js';
import { updateProjectTool } from './update-project.js';
import { deleteProjectTool } from './delete-project.js';

export function registerAllTools(store: MemoryStore, memoryDir: string): ToolDefinition[] {
  const apiKey = process.env.RADANMIND_API_KEY;
  const proxy = apiKey ? new RadanMindProxy({ apiKey }) : null;
  const cache = new CloudCache(memoryDir);

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

  if (proxy) {
    tools.push(
      createProjectTool(proxy, cache),
      listProjectsTool(proxy, cache),
      searchProjectsTool(proxy),
      updateProjectTool(proxy, cache),
      deleteProjectTool(proxy, cache),
    );
  }

  return tools;
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All existing tests + new proxy/cache tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/tools/create-project.ts src/tools/list-projects.ts src/tools/search-projects.ts src/tools/update-project.ts src/tools/delete-project.ts src/tools/index.ts
git commit -m "feat: add project tools (create, list, search, update, delete) with RadanMind proxy"
```

---

### Task 4: Task Tools

**Files:**
- Create: `src/tools/create-task.ts`
- Create: `src/tools/list-tasks.ts`
- Create: `src/tools/search-tasks.ts`
- Create: `src/tools/get-task.ts`
- Create: `src/tools/update-task.ts`
- Create: `src/tools/delete-task.ts`
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Write the tools**

```typescript
// src/tools/create-task.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const createTaskTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'create_task',
  description: 'Create a new task in a RadanMind project',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      instructions: { type: 'string', description: 'Task instructions' },
      task_knowledge: { type: 'string', description: 'Optional knowledge/context' },
      status: { type: 'string', description: 'Status: todo, in-progress, in-review, complete, cancelled' },
    },
    required: ['project_id', 'instructions'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      project_id: z.string().uuid(),
      instructions: z.string().min(1),
      task_knowledge: z.string().optional(),
      status: z.enum(['todo', 'in-progress', 'in-review', 'complete', 'cancelled']).optional(),
    });
    const { project_id, instructions, task_knowledge, status } = schema.parse(params);
    const result = await proxy.createTask(project_id, instructions, task_knowledge, status);
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
```

```typescript
// src/tools/list-tasks.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const listTasksTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'list_tasks',
  description: 'List tasks from RadanMind (cached for 5 min)',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Filter by project' },
      status: { type: 'string', description: 'Filter by status' },
      limit: { type: 'number', description: 'Max results' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ project_id: z.string().optional(), status: z.string().optional(), limit: z.number().optional() });
    const { project_id, status, limit } = schema.parse(params);
    
    const cached = await cache.getTasks(project_id);
    if (cached) {
      return { content: [{ type: 'text', text: JSON.stringify({ cached: true, tasks: limit ? cached.slice(0, limit) : cached }) }] };
    }
    
    const tasks = await proxy.listTasks(project_id, status, limit);
    await cache.setTasks(tasks, project_id);
    return { content: [{ type: 'text', text: JSON.stringify({ cached: false, tasks }) }] };
  },
});
```

```typescript
// src/tools/search-tasks.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';

export const searchTasksTool = (proxy: RadanMindProxy): ToolDefinition => ({
  name: 'search_tasks',
  description: 'Search tasks in RadanMind by instructions or knowledge',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      project_id: { type: 'string', description: 'Filter by project' },
      status: { type: 'string', description: 'Filter by status' },
    },
    required: ['query'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ query: z.string().min(1), project_id: z.string().optional(), status: z.string().optional() });
    const { query, project_id, status } = schema.parse(params);
    const results = await proxy.searchTasks(query, project_id, status);
    return { content: [{ type: 'text', text: JSON.stringify({ results }) }] };
  },
});
```

```typescript
// src/tools/get-task.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';

export const getTaskTool = (proxy: RadanMindProxy): ToolDefinition => ({
  name: 'get_task',
  description: 'Get a specific task from RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ id: z.string().uuid() });
    const { id } = schema.parse(params);
    const result = await proxy.getTask(id);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
```

```typescript
// src/tools/update-task.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const updateTaskTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'update_task',
  description: 'Update an existing task in RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID' },
      instructions: { type: 'string', description: 'New instructions' },
      status: { type: 'string', description: 'New status' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ id: z.string().uuid(), instructions: z.string().optional(), status: z.string().optional() });
    const { id, instructions, status } = schema.parse(params);
    const result = await proxy.updateTask(id, { instructions, status });
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
```

```typescript
// src/tools/delete-task.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const deleteTaskTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'delete_task',
  description: 'Delete a task from RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ id: z.string().uuid() });
    const { id } = schema.parse(params);
    await proxy.deleteTask(id);
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  },
});
```

- [ ] **Step 2: Register in index.ts**

Add imports and push to tools array in `src/tools/index.ts`:

```typescript
import { createTaskTool } from './create-task.js';
import { listTasksTool } from './list-tasks.js';
import { searchTasksTool } from './search-tasks.js';
import { getTaskTool } from './get-task.js';
import { updateTaskTool } from './update-task.js';
import { deleteTaskTool } from './delete-task.js';
```

In the `if (proxy)` block:
```typescript
tools.push(
  // ... project tools ...
  createTaskTool(proxy, cache),
  listTasksTool(proxy, cache),
  searchTasksTool(proxy),
  getTaskTool(proxy),
  updateTaskTool(proxy, cache),
  deleteTaskTool(proxy, cache),
);
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/tools/create-task.ts src/tools/list-tasks.ts src/tools/search-tasks.ts src/tools/get-task.ts src/tools/update-task.ts src/tools/delete-task.ts src/tools/index.ts
git commit -m "feat: add task tools (create, list, search, get, update, delete) with cache invalidation"
```

---

### Task 5: Agent Tools

**Files:**
- Create: `src/tools/create-agent.ts`
- Create: `src/tools/list-agents.ts`
- Create: `src/tools/get-agent.ts`
- Create: `src/tools/update-agent.ts`
- Create: `src/tools/delete-agent.ts`
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Write the tools**

```typescript
// src/tools/create-agent.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const createAgentTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'create_agent',
  description: 'Create a new agent in a RadanMind project',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      name: { type: 'string', description: 'Agent name' },
      system_prompt: { type: 'string', description: 'System prompt / instructions' },
    },
    required: ['project_id', 'name', 'system_prompt'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ project_id: z.string().uuid(), name: z.string().min(1), system_prompt: z.string().min(1) });
    const { project_id, name, system_prompt } = schema.parse(params);
    const result = await proxy.createAgent(project_id, name, system_prompt);
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
```

```typescript
// src/tools/list-agents.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const listAgentsTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'list_agents',
  description: 'List agents from RadanMind (cached for 5 min)',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Filter by project' },
      limit: { type: 'number', description: 'Max results' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ project_id: z.string().optional(), limit: z.number().optional() });
    const { project_id, limit } = schema.parse(params);
    
    const cached = await cache.getAgents(project_id);
    if (cached) {
      return { content: [{ type: 'text', text: JSON.stringify({ cached: true, agents: limit ? cached.slice(0, limit) : cached }) }] };
    }
    
    const agents = await proxy.listAgents(project_id, limit);
    await cache.setAgents(agents, project_id);
    return { content: [{ type: 'text', text: JSON.stringify({ cached: false, agents }) }] };
  },
});
```

```typescript
// src/tools/get-agent.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';

export const getAgentTool = (proxy: RadanMindProxy): ToolDefinition => ({
  name: 'get_agent',
  description: 'Get a specific agent from RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Agent ID' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ id: z.string().uuid() });
    const { id } = schema.parse(params);
    const result = await proxy.getAgent(id);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
```

```typescript
// src/tools/update-agent.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const updateAgentTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'update_agent',
  description: 'Update an existing agent in RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Agent ID' },
      name: { type: 'string', description: 'New name' },
      system_prompt: { type: 'string', description: 'New system prompt' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ id: z.string().uuid(), name: z.string().optional(), system_prompt: z.string().optional() });
    const { id, name, system_prompt } = schema.parse(params);
    const result = await proxy.updateAgent(id, { name, system_prompt });
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
```

```typescript
// src/tools/delete-agent.ts
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const deleteAgentTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'delete_agent',
  description: 'Delete an agent from RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Agent ID' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ id: z.string().uuid() });
    const { id } = schema.parse(params);
    await proxy.deleteAgent(id);
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  },
});
```

- [ ] **Step 2: Register in index.ts**

Add imports and push to tools array in `src/tools/index.ts`:

```typescript
import { createAgentTool } from './create-agent.js';
import { listAgentsTool } from './list-agents.js';
import { getAgentTool } from './get-agent.js';
import { updateAgentTool } from './update-agent.js';
import { deleteAgentTool } from './delete-agent.js';
```

In the `if (proxy)` block:
```typescript
tools.push(
  // ... project and task tools ...
  createAgentTool(proxy, cache),
  listAgentsTool(proxy, cache),
  getAgentTool(proxy),
  updateAgentTool(proxy, cache),
  deleteAgentTool(proxy, cache),
);
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/tools/create-agent.ts src/tools/list-agents.ts src/tools/get-agent.ts src/tools/update-agent.ts src/tools/delete-agent.ts src/tools/index.ts
git commit -m "feat: add agent tools (create, list, get, update, delete) with cache invalidation"
```

---

### Task 6: Update README + Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README with new tools**

Add after existing MCP Tools section:

```markdown
## MCP Tools (RadanMind Cloud — requires RADANMIND_API_KEY)

### Projects
- `create_project(name, description?)` — Create a new project
- `list_projects(limit?)` — List all projects (cached 5 min)
- `search_projects(query)` — Search projects by name/description
- `update_project(id, name?, description?)` — Update project
- `delete_project(id)` — Delete project

### Tasks
- `create_task(project_id, instructions, task_knowledge?, status?)` — Create task
- `list_tasks(project_id?, status?, limit?)` — List tasks (cached 5 min)
- `search_tasks(query, project_id?, status?)` — Search tasks
- `get_task(id)` — Get specific task
- `update_task(id, instructions?, status?)` — Update task
- `delete_task(id)` — Delete task

### Agents
- `create_agent(project_id, name, system_prompt)` — Create agent
- `list_agents(project_id?, limit?)` — List agents (cached 5 min)
- `get_agent(id)` — Get specific agent
- `update_agent(id, name?, system_prompt?)` — Update agent
- `delete_agent(id)` — Delete agent
```

- [ ] **Step 2: Run full test suite + typecheck + build**

```bash
npm run typecheck && npm test && npm run build && node dist/index.js --help
```
Expected: No TypeScript errors, all tests pass, build succeeds, CLI shows all commands

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with RadanMind cloud tools"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| RadanMindProxy client | Task 1 ✅ |
| JSON-RPC 2.0 + auth + timeout | Task 1 ✅ |
| CloudCache with TTL | Task 2 ✅ |
| Project tools (create, list, search, update, delete) | Task 3 ✅ |
| Task tools (create, list, search, get, update, delete) | Task 4 ✅ |
| Agent tools (create, list, get, update, delete) | Task 5 ✅ |
| Cache invalidation on write | Task 3-5 ✅ |
| Conditional registration (only if API key) | Task 3-5 ✅ |
| Degraded mode (memory works without key) | Task 3-5 ✅ |
| README update | Task 6 ✅ |

## Placeholder Scan

- No "TBD", "TODO", "implement later" found
- No vague requirements
- All code shown in full
- All file paths exact
- Type consistency checked (RadanMindProxy, CloudCache interfaces match across all tasks)
