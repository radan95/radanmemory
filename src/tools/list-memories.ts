import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';

export const listMemoriesTool = (store: MemoryStore): ToolDefinition => ({
  name: 'list_memories',
  description: 'List all memory notes, optionally filtered by tag',
  inputSchema: {
    type: 'object',
    properties: {
      tag: { type: 'string', description: 'Filter by tag' },
      limit: { type: 'number', description: 'Max results' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      tag: z.string().optional(),
      limit: z.number().optional(),
    });
    const { tag, limit } = schema.parse(params);
    const items = await store.list(tag, limit);
    return { content: [{ type: 'text', text: JSON.stringify({ total: items.length, items }) }] };
  },
});
