import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { TaskQueue } from '../tasks.js';
import { getOrchestratorContext } from '../orchestrator-context.js';

export const failTaskTool = (queue: TaskQueue): ToolDefinition => ({
  name: 'fail_task',
  description: 'Fail an active task with a reason',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task ID' },
      reason: { type: 'string', description: 'Failure reason' },
    },
    required: ['taskId', 'reason'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { taskId, reason } = z.object({
      taskId: z.string().uuid(),
      reason: z.string().min(1),
    }).parse(params);
    const success = await queue.fail(taskId, 'agent', reason);

    const ctx = getOrchestratorContext();
    if (ctx && success) {
      const task = await queue.get(taskId);
      await ctx.events.publish({
        type: 'task:failed',
        payload: { id: taskId, title: task?.title, reason, status: 'failed' },
        timestamp: new Date().toISOString(),
      });
    }

    return { content: [{ type: 'text', text: JSON.stringify({ success }) }] };
  },
});
