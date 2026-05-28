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

export interface ServerContext {
  store: MemoryStore;
  memoryDir: string;
  orchestrator?: boolean;
}

export function createMcpServer(context: ServerContext): { server: Server; tools: ToolDefinition[] } {
  const { store, memoryDir, orchestrator } = context;
  const tools: ToolDefinition[] = registerAllTools(store, memoryDir, { orchestrator: orchestrator ?? false });

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
      const error = err instanceof Error ? err : new Error(String(err));
      const wrapped = new Error(`Tool error: ${error.message}`);
      (wrapped as Error & { cause?: Error }).cause = error;
      throw wrapped;
    }
  });

  return { server, tools };
}

export async function startStdioServer(): Promise<void> {
  const memoryDir = await discoverOrCreateMemoryDir();
  await ensureIndexFile(memoryDir);
  const store = new MemoryStore(memoryDir);
  const { server } = createMcpServer({ store, memoryDir, orchestrator: false });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Backward compatibility alias
export async function startServer(): Promise<void> {
  return startStdioServer();
}
