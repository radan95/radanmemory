import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const createAgentTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'create_agent',
  description: 'Create a new agent in a RadanMind project',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Project ID (UUID)' },
      name: { type: 'string', description: 'Agent name' },
      system_prompt: { type: 'string', description: 'System prompt for the agent' },
    },
    required: ['project_id', 'name', 'system_prompt'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      project_id: z.string().uuid(),
      name: z.string().min(1),
      system_prompt: z.string().min(1),
    });
    const { project_id, name, system_prompt } = schema.parse(params);
    const result = await proxy.createAgent(project_id, name, system_prompt);
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
