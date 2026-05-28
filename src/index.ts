#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('radanmemory')
  .description('Local-first knowledge graph MCP server')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize .radanmemory/ folder in current directory')
  .action(() => {
    console.log('radanmemory: init not yet implemented');
  });

program
  .command('sync')
  .description('Sync memories with RadanMind cloud')
  .action(() => {
    console.log('radanmemory: sync not yet implemented');
  });

program
  .command('server', { isDefault: true })
  .description('Start MCP stdio server')
  .action(() => {
    console.log('radanmemory: server not yet implemented');
  });

program.parse();