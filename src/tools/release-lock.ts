import type { ToolDefinition } from './types.js';
import { LockManager } from '../locks.js';

export const releaseLockTool = (_locks: LockManager): ToolDefinition => ({
  name: 'release_lock',
  description: 'Release an orchestrator lock',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Lock title' },
      agent_id: { type: 'string', description: 'Agent ID' },
    },
    required: ['title', 'agent_id'],
  },
  handler: async () => ({ content: [] }),
});
