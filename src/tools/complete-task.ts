import type { ToolDefinition } from './types.js';
import { TaskQueue } from '../tasks.js';

export const completeTaskTool = (_queue: TaskQueue): ToolDefinition => ({
  name: 'complete_task',
  description: 'Complete an active orchestrator task',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID' },
      agent_id: { type: 'string', description: 'Agent ID' },
    },
    required: ['id', 'agent_id'],
  },
  handler: async () => ({ content: [] }),
});
