import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startHttpServer } from '../src/transports/http.js';
import type { Server } from 'node:http';

async function readSseSessionId(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const match = buffer.match(/event: endpoint\ndata: (.+)\n/);
    if (match) {
      const url = new URL(match[1], `http://localhost`);
      return url.searchParams.get('sessionId')!;
    }
  }
  throw new Error('No endpoint event received');
}

describe('HTTP Transport', () => {
  let tmpDir: string;
  let server: Server;
  let port: number;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'http-test-'));
    const result = await startHttpServer({ memoryDir: tmpDir, port: 0 });
    server = result.server;
    port = (server.address() as any).port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('responds to health check', async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
  });

  it('accepts SSE connection', async () => {
    const controller = new AbortController();
    const res = await fetch(`http://localhost:${port}/sse`, { signal: controller.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    controller.abort();
  });

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`http://localhost:${port}/unknown`);
    expect(res.status).toBe(404);
  });

  it('accepts POST to /messages and cleans up session on close', async () => {
    const controller = new AbortController();
    const sseRes = await fetch(`http://localhost:${port}/sse`, { signal: controller.signal });
    expect(sseRes.status).toBe(200);

    const sessionId = await readSseSessionId(sseRes);
    expect(sessionId).toBeTruthy();

    // Post a valid JSON-RPC message to the session
    const postRes = await fetch(`http://localhost:${port}/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    // The SDK returns 202 for accepted messages
    expect(postRes.status).toBe(202);

    // Close the SSE connection
    controller.abort();

    // Give the server a moment to process the close
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Posting again should return 404 because the session is cleaned up
    const postAfterClose = await fetch(`http://localhost:${port}/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(postAfterClose.status).toBe(404);
  });
});
