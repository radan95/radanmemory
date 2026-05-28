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
      const mem = await store.read(meta.title);
      payload.memories.push({
        title: mem.title,
        content: mem.content,
        tags: mem.tags,
        checksum: contentChecksum(mem.content),
        updated: mem.updated,
      });
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

    return { pushed: payload.memories.length, pulled: 0, conflicts: [] };
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

    const data = await response.json();
    const cloudMemories = data.result?.items ?? [];
    let pulled = 0;
    const conflicts: string[] = [];

    for (const cm of cloudMemories) {
      const exists = await store.exists(cm.title);
      if (!exists) {
        await store.create(cm.title, cm.content, cm.tags);
        pulled++;
      }
    }

    return { pushed: 0, pulled, conflicts };
  }

  async syncBoth(store: MemoryStore): Promise<SyncResult> {
    const pushResult = await this.push(store);
    const pullResult = await this.pull(store);
    return {
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
      conflicts: [...pushResult.conflicts, ...pullResult.conflicts],
    };
  }
}
