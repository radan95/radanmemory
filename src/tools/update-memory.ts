import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';
import { getOrchestratorContext } from '../orchestrator-context.js';

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

    const ctx = getOrchestratorContext();
    if (ctx) {
      await ctx.events.publish({
        type: 'memory:updated',
        payload: { title: mem.title },
        timestamp: new Date().toISOString(),
      });
    }

    return { content: [{ type: 'text', text: JSON.stringify(mem) }] };
  },
});
