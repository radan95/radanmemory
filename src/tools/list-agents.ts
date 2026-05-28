import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const listAgentsTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'list_agents',
  description: 'List agents from RadanMind (cached for 5 min)',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Optional project ID filter' },
      limit: { type: 'number', description: 'Max results' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      project_id: z.string().optional(),
      limit: z.number().optional(),
    });
    const { project_id, limit } = schema.parse(params);

    const cached = await cache.getAgents(project_id);
    if (cached) {
      return { content: [{ type: 'text', text: JSON.stringify({ cached: true, agents: limit ? cached.slice(0, limit) : cached }) }] };
    }

    const agents = await proxy.listAgents(project_id, limit);
    await cache.setAgents(agents, project_id);
    return { content: [{ type: 'text', text: JSON.stringify({ cached: false, agents }) }] };
  },
});
