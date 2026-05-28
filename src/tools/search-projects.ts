import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';

export const searchProjectsTool = (proxy: RadanMindProxy): ToolDefinition => ({
  name: 'search_projects',
  description: 'Search projects in RadanMind by name or description',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ query: z.string().min(1) });
    const { query } = schema.parse(params);
    const results = await proxy.searchProjects(query);
    return { content: [{ type: 'text', text: JSON.stringify({ results }) }] };
  },
});
