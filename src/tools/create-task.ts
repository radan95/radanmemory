import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { TaskQueue } from '../tasks.js';
import { getOrchestratorContext } from '../orchestrator-context.js';

export const createTaskTool = (queue: TaskQueue): ToolDefinition => ({
  name: 'workspace_create_task',
  description: 'Create a new task in the workspace queue',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Task description' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
    },
    required: ['title', 'description'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { title, description, tags } = z.object({
      title: z.string().min(1),
      description: z.string(),
      tags: z.array(z.string()).optional().default([]),
    }).parse(params);
    const task = await queue.create(title, description, tags);

    const ctx = getOrchestratorContext();
    if (ctx) {
      await ctx.events.publish({
        type: 'task:created',
        payload: { id: task.id, title: task.title, status: task.status },
        timestamp: new Date().toISOString(),
      });
    }

    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  },
});
