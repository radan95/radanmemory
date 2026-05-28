import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { TaskQueue } from '../tasks.js';
import { getOrchestratorContext } from '../orchestrator-context.js';

export const completeTaskTool = (queue: TaskQueue): ToolDefinition => ({
  name: 'complete_task',
  description: 'Complete an active task',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task ID' },
    },
    required: ['taskId'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { taskId } = z.object({ taskId: z.string().uuid() }).parse(params);
    const success = await queue.complete(taskId, 'agent');

    const ctx = getOrchestratorContext();
    if (ctx && success) {
      const task = await queue.get(taskId);
      await ctx.events.publish({
        type: 'task:completed',
        payload: { id: taskId, title: task?.title, status: 'completed' },
        timestamp: new Date().toISOString(),
      });
    }

    return { content: [{ type: 'text', text: JSON.stringify({ success }) }] };
  },
});
