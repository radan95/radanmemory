import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';

export const getAgentTool = (proxy: RadanMindProxy): ToolDefinition => ({
  name: 'get_agent',
  description: 'Get a specific agent from RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Agent ID (UUID)' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({ id: z.string().uuid() });
    const { id } = schema.parse(params);
    const result = await proxy.getAgent(id);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
