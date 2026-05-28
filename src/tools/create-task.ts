import type { ToolDefinition } from './types.js';
import { TaskQueue } from '../tasks.js';

export const createTaskTool = (_queue: TaskQueue): ToolDefinition => ({
  name: 'workspace_create_task',
  description: 'Create a new orchestrator task',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Task description' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
    },
    required: ['title', 'description'],
  },
  handler: async () => ({ content: [] }),
});
