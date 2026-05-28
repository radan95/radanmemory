import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';
import { SyncClient } from '../sync.js';

export const syncMemoriesTool = (store: MemoryStore): ToolDefinition => ({
  name: 'sync_memories',
  description: 'Sync memories with RadanMind cloud (push, pull, or both)',
  inputSchema: {
    type: 'object',
    properties: {
      direction: { type: 'string', description: 'push, pull, or both', enum: ['push', 'pull', 'both'] },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      direction: z.enum(['push', 'pull', 'both']).optional().default('both'),
    });
    const { direction } = schema.parse(params);
    const client = new SyncClient();
    const result = direction === 'push'
      ? await client.push(store)
      : direction === 'pull'
        ? await client.pull(store)
        : await client.syncBoth(store);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
