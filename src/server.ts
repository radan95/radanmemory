import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryStore } from './memory-store.js';
import { discoverOrCreateMemoryDir, ensureIndexFile } from './discover.js';
import { registerAllTools } from './tools/index.js';
import type { ToolDefinition } from './tools/types.js';

export async function startServer(): Promise<void> {
  const memoryDir = await discoverOrCreateMemoryDir();
  await ensureIndexFile(memoryDir);
  const store = new MemoryStore(memoryDir);

  const tools: ToolDefinition[] = registerAllTools(store, memoryDir);

  const server = new Server(
    { name: 'radanmemory', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((t) => t.name === request.params.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }
    try {
      return await tool.handler(request.params.arguments ?? {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Tool error: ${message}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
