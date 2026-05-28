import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { buildBacklinkIndex } from '../wikilink-parser.js';

export const findBacklinksTool = (memoryDir: string): ToolDefinition => ({
  name: 'find_backlinks',
  description: 'Find all notes that link to a given note',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title' },
    },
    required: ['title'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { title } = z.object({ title: z.string().min(1) }).parse(params);
    const index = await buildBacklinkIndex(memoryDir);
    const backlinks = index[title] ?? [];
    return { content: [{ type: 'text', text: JSON.stringify({ title, backlinks }) }] };
  },
});
