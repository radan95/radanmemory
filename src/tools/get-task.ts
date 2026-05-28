import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';

export const getTaskTool = (proxy: RadanMindProxy): ToolDefinition => ({
  name: 'get_task',
  description: 'Get a specific task from RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID (UUID)' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ id: z.string().uuid() });
    const { id } = schema.parse(params);
    const result = await proxy.getTask(id);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
