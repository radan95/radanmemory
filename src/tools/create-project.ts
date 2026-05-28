import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const createProjectTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'create_project',
  description: 'Create a new project in RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Project name' },
      description: { type: 'string', description: 'Optional description' },
    },
    required: ['name'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ name: z.string().min(1), description: z.string().optional() });
    const { name, description } = schema.parse(params);
    const result = await proxy.createProject(name, description);
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
