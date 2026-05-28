import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { EventBus } from '../events.js';

export const getActivityFeedTool = (events: EventBus): ToolDefinition => ({
  name: 'get_activity_feed',
  description: 'Get the orchestrator activity feed',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max events to return (default 50)' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const { limit } = z.object({ limit: z.number().optional().default(50) }).parse(params);
    const history = await events.getHistory(limit);
    return { content: [{ type: 'text', text: JSON.stringify(history) }] };
  },
});
