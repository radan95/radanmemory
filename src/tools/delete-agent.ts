import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const deleteAgentTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'delete_agent',
  description: 'Delete an agent from RadanMind',
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
    await proxy.deleteAgent(id);
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  },
});
