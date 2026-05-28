import type { ToolDefinition } from './types.js';
import { TaskQueue } from '../tasks.js';

export const listTasksTool = (_queue: TaskQueue): ToolDefinition => ({
  name: 'workspace_list_tasks',
  description: 'List orchestrator tasks',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Optional status filter' },
    },
  },
  handler: async () => ({ content: [] }),
});
