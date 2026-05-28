import type { SyncPayload, SyncResult } from './types.js';
import { MemoryStore } from './memory-store.js';

const SYNC_API = 'https://radanmind.vercel.app/api/mcp';
const SYNC_TIMEOUT_MS = 30_000;

function getApiKey(): string {
  const key = process.env.RADANMIND_API_KEY;
  if (!key) throw new Error('RADANMIND_API_KEY environment variable not set');
  return key;
}

function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

interface JsonRpcResponse {
  jsonrpc: string;
  result?: { 
    accepted?: number; 
    items?: Array<{ title: string; content: string; tags: string[] }>;
    created?: number;
    updated?: number;
    unchanged?: number;
    total?: number;
  };
  error?: { code: number; message: string };
  id: number;
}

export class SyncClient {
  constructor(private apiKey?: string) {
    this.apiKey = apiKey ?? getApiKey();
  }

  async push(store: MemoryStore): Promise<SyncResult> {
    const list = await store.list();
    const payload: SyncPayload = {
      memories: [],
    };

    for (const meta of list) {
      try {
        const mem = await store.read(meta.title);
        payload.memories.push({
          title: mem.title,
          content: mem.content,
          tags: mem.tags,
          links: mem.links,
          checksum: await store.checksum(meta.title),
          updated: mem.updated,
        });
      } catch {
        // Skip files that were deleted between list and read
        continue;
      }
    }

    const response = await fetchWithTimeout(SYNC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'sync_memories',
          arguments: { memories: payload.memories }
        },
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Sync push failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as JsonRpcResponse;
    if (data.error) {
      throw new Error(`Sync push failed: ${data.error.code} ${data.error.message}`);
    }

    const created = data.result?.created ?? 0;
    const updated = data.result?.updated ?? 0;
    const pushed = created + updated;
    return { pushed, pulled: 0, conflicts: [] };
  }

  async pull(store: MemoryStore): Promise<SyncResult> {
    const response = await fetchWithTimeout(SYNC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'list_memories',
          arguments: { limit: 1000 }
        },
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Sync pull failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as JsonRpcResponse;
    if (data.error) {
      throw new Error(`Sync pull failed: ${data.error.code} ${data.error.message}`);
    }

    let cloudMemories: Array<{ title: string; content?: string; tags?: string[] }> = [];
    try {
      if (data.result && typeof data.result === 'object' && 'content' in data.result) {
        const contentArr = (data.result as any).content as Array<{ type: string; text: string }>;
        if (contentArr?.[0]?.text) {
          const parsed = JSON.parse(contentArr[0].text);
          cloudMemories = parsed.items ?? [];
        }
      } else if (data.result && typeof data.result === 'object' && 'items' in data.result) {
        cloudMemories = (data.result as any).items ?? [];
      }
    } catch {
      cloudMemories = [];
    }
    let pulled = 0;
    const conflicts: string[] = [];

    for (const cm of cloudMemories) {
      const exists = await store.exists(cm.title);
      if (!exists && cm.content) {
        try {
          await store.create(cm.title, cm.content, cm.tags || []);
          pulled++;
        } catch (err) {
          conflicts.push(cm.title);
        }
      }
    }

    return { pushed: 0, pulled, conflicts };
  }

  async syncBoth(store: MemoryStore): Promise<SyncResult> {
    let pushResult: SyncResult = { pushed: 0, pulled: 0, conflicts: [] };
    let pullResult: SyncResult = { pushed: 0, pulled: 0, conflicts: [] };

    try {
      pushResult = await this.push(store);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushResult.conflicts.push(`push-error: ${message}`);
    }

    try {
      pullResult = await this.pull(store);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pullResult.conflicts.push(`pull-error: ${message}`);
    }

    return {
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
      conflicts: [...pushResult.conflicts, ...pullResult.conflicts],
    };
  }
}
