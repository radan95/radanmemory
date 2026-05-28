import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { TaskQueue } from '../tasks.js';
import { getOrchestratorContext } from '../orchestrator-context.js';

export const claimTaskTool = (queue: TaskQueue): ToolDefinition => ({
  name: 'claim_task',
  description: 'Claim a pending task to work on it',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task ID' },
    },
    required: ['taskId'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { taskId } = z.object({ taskId: z.string().uuid() }).parse(params);
    const success = await queue.claim(taskId, 'agent');

    const ctx = getOrchestratorContext();
    if (ctx && success) {
      const task = await queue.get(taskId);
      await ctx.events.publish({
        type: 'task:claimed',
        payload: { id: taskId, title: task?.title, assignee: 'agent' },
        timestamp: new Date().toISOString(),
      });
    }

    return { content: [{ type: 'text', text: JSON.stringify({ success }) }] };
  },
});
