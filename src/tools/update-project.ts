import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const updateProjectTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'update_project',
  description: 'Update an existing project in RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Project ID' },
      name: { type: 'string', description: 'New name' },
      description: { type: 'string', description: 'New description' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ id: z.string().uuid(), name: z.string().optional(), description: z.string().optional() });
    const { id, name, description } = schema.parse(params);
    const result = await proxy.updateProject(id, { name, description });
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
