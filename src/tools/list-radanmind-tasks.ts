import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const listRadanMindTasksTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'list_tasks',
  description: 'List tasks from RadanMind (cached for 5 min)',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Optional project ID filter' },
      status: { type: 'string', description: 'Optional status filter' },
      limit: { type: 'number', description: 'Max results' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      project_id: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().optional(),
    });
    const { project_id, status, limit } = schema.parse(params);

    const cached = await cache.getTasks(project_id);
    if (cached) {
      return { content: [{ type: 'text', text: JSON.stringify({ cached: true, tasks: limit ? cached.slice(0, limit) : cached }) }] };
    }

    const tasks = await proxy.listTasks(project_id, status, limit);
    await cache.setTasks(tasks, project_id);
    return { content: [{ type: 'text', text: JSON.stringify({ cached: false, tasks }) }] };
  },
});
