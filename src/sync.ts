import { createHash } from 'node:crypto';
import type { SyncPayload, SyncResult } from './types.js';
import { MemoryStore } from './memory-store.js';

const SYNC_API = 'https://radanmind.vercel.app/api/mcp';

function getApiKey(): string {
  const key = process.env.RADANMIND_API_KEY;
  if (!key) throw new Error('RADANMIND_API_KEY environment variable not set');
  return key;
}

function contentChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

interface JsonRpcResponse {
  jsonrpc: string;
  result?: { accepted?: number; items?: Array<{ title: string; content: string; tags: string[] }> };
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
          checksum: contentChecksum(mem.content),
          updated: mem.updated,
        });
      } catch {
        // Skip files that were deleted between list and read
        continue;
      }
    }

    const response = await fetch(SYNC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'sync_memories',
        params: { memories: payload.memories },
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

    const accepted = data.result?.accepted ?? payload.memories.length;
    return { pushed: accepted, pulled: 0, conflicts: [] };
  }

  async pull(store: MemoryStore): Promise<SyncResult> {
    const response = await fetch(SYNC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'list_cloud_memories',
        params: {},
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

    const cloudMemories = data.result?.items ?? [];
    let pulled = 0;
    const conflicts: string[] = [];

    for (const cm of cloudMemories) {
      const exists = await store.exists(cm.title);
      if (!exists) {
        try {
          await store.create(cm.title, cm.content, cm.tags);
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
      throw new Error(`Push failed: ${message}`);
    }

    try {
      pullResult = await this.pull(store);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Return combined results with pull error noted in conflicts
      return {
        pushed: pushResult.pushed,
        pulled: 0,
        conflicts: [...pushResult.conflicts, ...pullResult.conflicts, `pull-error: ${message}`],
      };
    }

    return {
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
      conflicts: [...pushResult.conflicts, ...pullResult.conflicts],
    };
  }
}
