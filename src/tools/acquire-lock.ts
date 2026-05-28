import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { LockManager } from '../locks.js';

export const acquireLockTool = (locks: LockManager): ToolDefinition => ({
  name: 'acquire_lock',
  description: 'Acquire an orchestrator lock on a resource',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Lock title / resource name' },
      ttl: { type: 'number', description: 'Lock TTL in seconds (default 300)' },
    },
    required: ['title'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { title, ttl } = z.object({
      title: z.string().min(1),
      ttl: z.number().optional().default(300),
    }).parse(params);
    const result = await locks.acquire(title, 'agent', ttl);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
});
