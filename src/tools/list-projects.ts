import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const listProjectsTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'list_projects',
  description: 'List all projects from RadanMind (cached for 5 min)',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max results' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ limit: z.number().optional() });
    const { limit } = schema.parse(params);

    const cached = await cache.getProjects();
    if (cached) {
      return { content: [{ type: 'text', text: JSON.stringify({ cached: true, projects: limit ? cached.slice(0, limit) : cached }) }] };
    }

    const projects = await proxy.listProjects(limit);
    await cache.setProjects(projects);
    return { content: [{ type: 'text', text: JSON.stringify({ cached: false, projects }) }] };
  },
});
