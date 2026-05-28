import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const updateTaskTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'update_task',
  description: 'Update an existing task in RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID (UUID)' },
      instructions: { type: 'string', description: 'New instructions' },
      status: { type: 'string', description: 'New status' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      id: z.string().uuid(),
      instructions: z.string().optional(),
      status: z.string().optional(),
    });
    const { id, instructions, status } = schema.parse(params);
    const result = await proxy.updateTask(id, { instructions, status });
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
