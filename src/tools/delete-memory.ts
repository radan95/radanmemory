import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';

export const deleteMemoryTool = (store: MemoryStore): ToolDefinition => ({
  name: 'delete_memory',
  description: 'Soft-delete a memory note (moves to _deleted/)',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title' },
    },
    required: ['title'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { title } = z.object({ title: z.string().min(1) }).parse(params);
    await store.delete(title);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  },
});
