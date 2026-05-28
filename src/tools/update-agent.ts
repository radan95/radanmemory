import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const updateAgentTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'update_agent',
  description: 'Update an existing agent in RadanMind',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Agent ID (UUID)' },
      name: { type: 'string', description: 'New name' },
      system_prompt: { type: 'string', description: 'New system prompt' },
    },
    required: ['id'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      id: z.string().uuid(),
      name: z.string().optional(),
      system_prompt: z.string().optional(),
    });
    const { id, name, system_prompt } = schema.parse(params);
    const result = await proxy.updateAgent(id, { name, system_prompt });
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
