import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { LockManager } from '../locks.js';

export const releaseLockTool = (locks: LockManager): ToolDefinition => ({
  name: 'release_lock',
  description: 'Release an orchestrator lock',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Lock title / resource name' },
    },
    required: ['title'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { title } = z.object({ title: z.string().min(1) }).parse(params);
    const success = await locks.release(title, 'agent');
    return { content: [{ type: 'text', text: JSON.stringify({ success }) }] };
  },
});
