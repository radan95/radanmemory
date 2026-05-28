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
  jsonrpc: '2.0';
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

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.timeout}ms`);
      }
      throw new Error(`RadanMind network error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`RadanMind error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as JsonRpcResponse;
    if (data.error) {
      throw new Error(`RadanMind error: ${data.error.code} ${data.error.message}`);
    }

    return data.result as T;
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
