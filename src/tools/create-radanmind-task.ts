import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';

export const createRadanMindTaskTool = (proxy: RadanMindProxy, cache: CloudCache): ToolDefinition => ({
  name: 'create_task',
  description: 'Create a new task in a RadanMind project',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Project ID (UUID)' },
      instructions: { type: 'string', description: 'Task instructions' },
      task_knowledge: { type: 'string', description: 'Optional task knowledge' },
      status: { type: 'string', description: 'Optional status: todo, in-progress, in-review, complete, cancelled' },
    },
    required: ['project_id', 'instructions'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      project_id: z.string().uuid(),
      instructions: z.string().min(1),
      task_knowledge: z.string().optional(),
      status: z.enum(['todo', 'in-progress', 'in-review', 'complete', 'cancelled']).optional(),
    });
    const { project_id, instructions, task_knowledge, status } = schema.parse(params);
    const result = await proxy.createTask(project_id, instructions, task_knowledge, status);
    await cache.invalidate();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
