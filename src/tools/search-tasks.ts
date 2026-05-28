import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';

export const searchTasksTool = (proxy: RadanMindProxy): ToolDefinition => ({
  name: 'search_tasks',
  description: 'Search tasks in RadanMind by instructions or knowledge',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      project_id: { type: 'string', description: 'Optional project ID filter' },
      status: { type: 'string', description: 'Optional status filter' },
    },
    required: ['query'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      query: z.string().min(1),
      project_id: z.string().optional(),
      status: z.string().optional(),
    });
    const { query, project_id, status } = schema.parse(params);
    const results = await proxy.searchTasks(query, project_id, status);
    return { content: [{ type: 'text', text: JSON.stringify({ results }) }] };
  },
});
