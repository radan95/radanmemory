import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const deleteProjectTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'delete_project',
  description: 'Delete a project from RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Project ID' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ id: z.string().uuid() });
    const { id } = schema.parse(params);
    await proxy.deleteProject(id);
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  },
});
