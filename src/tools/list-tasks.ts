import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { TaskQueue } from '../tasks.js';

export const listTasksTool = (queue: TaskQueue): ToolDefinition => ({
  name: 'workspace_list_tasks',
  description: 'List orchestrator tasks with optional filtering',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'active', 'completed', 'failed'], description: 'Optional status filter' },
      limit: { type: 'number', description: 'Max tasks to return' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const { status, limit } = z.object({
      status: z.enum(['pending', 'active', 'completed', 'failed']).optional(),
      limit: z.number().optional(),
    }).parse(params);
    const tasks = await queue.list(status);
    const result = limit !== undefined ? tasks.slice(0, limit) : tasks;
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
