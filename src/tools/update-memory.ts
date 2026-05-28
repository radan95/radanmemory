import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';

export const updateMemoryTool = (store: MemoryStore): ToolDefinition => ({
  name: 'update_memory',
  description: 'Update an existing memory note',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title' },
      content: { type: 'string', description: 'New markdown content' },
      tags: { type: 'array', items: { type: 'string' }, description: 'New tags' },
    },
    required: ['title'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      title: z.string().min(1),
      content: z.string().optional(),
      tags: z.array(z.string()).optional(),
    });
    const { title, content, tags } = schema.parse(params);
    const updates: { content?: string; tags?: string[] } = {};
    if (content !== undefined) updates.content = content;
    if (tags !== undefined) updates.tags = tags;
    const mem = await store.update(title, updates);
    return { content: [{ type: 'text', text: JSON.stringify(mem) }] };
  },
});
