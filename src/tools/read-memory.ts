import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';
import { buildBacklinkIndex } from '../wikilink-parser.js';

export const readMemoryTool = (store: MemoryStore, memoryDir: string): ToolDefinition => ({
  name: 'read_memory',
  description: 'Read a memory note with its backlinks',
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
    const backlinks = await buildBacklinkIndex(memoryDir);
    mem.backlinks = backlinks[title] ?? [];
    return { content: [{ type: 'text', text: JSON.stringify(mem) }] };
  },
});
