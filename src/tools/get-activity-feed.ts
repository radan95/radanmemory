import type { ToolDefinition } from './types.js';
import { EventBus } from '../events.js';

export const getActivityFeedTool = (_events: EventBus): ToolDefinition => ({
  name: 'get_activity_feed',
  description: 'Get the orchestrator activity feed',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max events to return' },
    },
  },
  handler: async () => ({ content: [] }),
});
