import type { ToolDefinition } from './types.js';
import { TaskQueue } from '../tasks.js';

export const failTaskTool = (_queue: TaskQueue): ToolDefinition => ({
  name: 'fail_task',
  description: 'Fail an active orchestrator task',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID' },
      agent_id: { type: 'string', description: 'Agent ID' },
      reason: { type: 'string', description: 'Failure reason' },
    },
    required: ['id', 'agent_id', 'reason'],
  },
  handler: async () => ({ content: [] }),
});
