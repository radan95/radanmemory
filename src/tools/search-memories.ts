import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { searchMemories } from '../search.js';

export const searchMemoriesTool = (memoryDir: string): ToolDefinition => ({
  name: 'search_memories',
  description: 'Full-text search across memory notes',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { query } = z.object({ query: z.string().min(1) }).parse(params);
    const results = await searchMemories(memoryDir, query);
    return { content: [{ type: 'text', text: JSON.stringify({ results }) }] };
  },
});
