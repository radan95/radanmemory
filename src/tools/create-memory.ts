import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';
import { getOrchestratorContext } from '../orchestrator-context.js';

export const createMemoryTool = (store: MemoryStore): ToolDefinition => ({
  name: 'create_memory',
  description: 'Create a new memory note in .radanmemory/',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title (kebab-case)' },
      content: { type: 'string', description: 'Markdown content' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
      author: { type: 'string', description: 'Optional author name' },
    },
    required: ['title', 'content'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      title: z.string().min(1),
      content: z.string(),
      tags: z.array(z.string()).optional().default([]),
      author: z.string().optional(),
    });
    const { title, content, tags, author } = schema.parse(params);
    const mem = await store.create(title, content, tags, author);

    const ctx = getOrchestratorContext();
    if (ctx) {
      await ctx.events.publish({
        type: 'memory:created',
        payload: { title: mem.title, author },
        timestamp: new Date().toISOString(),
      });
    }

    return { content: [{ type: 'text', text: JSON.stringify(mem) }] };
  },
});
