import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Server } from 'node:http';
import { MemoryStore } from '../memory-store.js';
import { discoverOrCreateMemoryDir, ensureIndexFile } from '../discover.js';
import { registerAllTools } from '../tools/index.js';
import { SessionManager } from '../session.js';
import type { ToolDefinition } from '../tools/types.js';

export interface HttpServerOptions {
  memoryDir?: string;
  port?: number;
  host?: string;
}

export async function startHttpServer(options: HttpServerOptions = {}): Promise<{ server: Server; port: number }> {
  const memoryDir = options.memoryDir ?? await discoverOrCreateMemoryDir();
  await ensureIndexFile(memoryDir);
  const store = new MemoryStore(memoryDir);
  const port = options.port ?? 3000;
  const host = options.host ?? '127.0.0.1';

  const app = express();
  app.use(express.json());

  const sessions = new SessionManager();
  const transports = new Map<string, SSEServerTransport>();

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  app.get('/sse', async (_req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    const sessionId = transport.sessionId;
    sessions.register(sessionId, 'agent');
    transports.set(sessionId, transport);

    const tools: ToolDefinition[] = registerAllTools(store, memoryDir, { orchestrator: true });

    const mcp = new McpServer(
      { name: 'radanmemory', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    }));

    mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = tools.find(t => t.name === request.params.name);
      if (!tool) throw new Error(`Unknown tool: ${request.params.name}`);
      try {
        return await tool.handler(request.params.arguments ?? {});
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        throw new Error(`Tool error: ${error.message}`);
      }
    });

    transport.onclose = () => {
      sessions.remove(sessionId);
      transports.delete(sessionId);
    };

    await mcp.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).end('Session not found');
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  return new Promise((resolve) => {
    const httpServer = app.listen(port, host, () => {
      const addr = httpServer.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      console.log(`radanmemory: HTTP server listening on http://${host}:${actualPort}`);
      resolve({ server: httpServer, port: actualPort });
    });
  });
}
