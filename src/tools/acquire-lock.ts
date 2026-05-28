import type { ToolDefinition } from './types.js';
import { LockManager } from '../locks.js';

export const acquireLockTool = (_locks: LockManager): ToolDefinition => ({
  name: 'acquire_lock',
  description: 'Acquire an orchestrator lock',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Lock title' },
      agent_id: { type: 'string', description: 'Agent ID' },
      ttl_seconds: { type: 'number', description: 'Lock TTL in seconds' },
    },
    required: ['title', 'agent_id', 'ttl_seconds'],
  },
  handler: async () => ({ content: [] }),
});
