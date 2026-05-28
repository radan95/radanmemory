#!/usr/bin/env node

import { Command } from 'commander';
import { discoverOrCreateMemoryDir, ensureIndexFile } from './discover.js';
import { startStdioServer } from './server.js';
import { startHttpServer } from './transports/http.js';
import { MemoryStore } from './memory-store.js';
import { SyncClient } from './sync.js';

const program = new Command();

program
  .name('radanmemory')
  .description('Local-first knowledge graph MCP server')
  .version('1.0.0');

program
  .command('server', { isDefault: true })
  .description('Start MCP server')
  .option('--http', 'Start HTTP server for multi-agent mode')
  .option('--port <port>', 'HTTP port', '3000')
  .option('--host <host>', 'HTTP host', '127.0.0.1')
  .action(async (opts: { http?: boolean; port: string; host: string }) => {
    try {
      if (opts.http) {
        await startHttpServer({ port: parseInt(opts.port, 10), host: opts.host });
      } else {
        await startStdioServer();
      }
    } catch (err) {
      console.error('radanmemory: fatal error starting server', err);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize .radanmemory/ folder')
  .action(async () => {
    const dir = await discoverOrCreateMemoryDir();
    await ensureIndexFile(dir);
    console.log(`radanmemory: initialized ${dir}`);
  });

program
  .command('sync')
  .description('Sync memories with RadanMind cloud')
  .option('-d, --direction <dir>', 'push, pull, or both', 'both')
  .action(async (opts: { direction: string }) => {
    try {
      const memoryDir = await discoverOrCreateMemoryDir();
      const store = new MemoryStore(memoryDir);
      const client = new SyncClient();
      const result = opts.direction === 'push'
        ? await client.push(store)
        : opts.direction === 'pull'
          ? await client.pull(store)
          : await client.syncBoth(store);
      console.log(`radanmemory: sync complete — pushed ${result.pushed}, pulled ${result.pulled}, conflicts ${result.conflicts.length}`);
    } catch (err) {
      console.error('radanmemory: sync failed', err);
      process.exit(1);
    }
  });

program.parse();
