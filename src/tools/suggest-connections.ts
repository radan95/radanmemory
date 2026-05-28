import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';
import { suggestConnections } from '../connector.js';

export const suggestConnectionsTool = (store: MemoryStore, memoryDir: string): ToolDefinition => ({
  name: 'suggest_connections',
  description: 'Suggest related memory notes based on tags and links',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title' },
    },
    required: ['title'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { title } = z.object({ title: z.string().min(1) }).parse(params);
    const mem = await store.read(title);
    const suggestions = await suggestConnections(memoryDir, mem);
    return { content: [{ type: 'text', text: JSON.stringify({ title, suggestions }) }] };
  },
});
