import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';
import { createMemoryTool } from './create-memory.js';
import { readMemoryTool } from './read-memory.js';
import { updateMemoryTool } from './update-memory.js';
import { deleteMemoryTool } from './delete-memory.js';
import { listMemoriesTool } from './list-memories.js';
import { searchMemoriesTool } from './search-memories.js';
import { findBacklinksTool } from './find-backlinks.js';
import { suggestConnectionsTool } from './suggest-connections.js';
import { syncMemoriesTool } from './sync-memories.js';

export function registerAllTools(store: MemoryStore, memoryDir: string): ToolDefinition[] {
  return [
    createMemoryTool(store),
    readMemoryTool(store, memoryDir),
    updateMemoryTool(store),
    deleteMemoryTool(store),
    listMemoriesTool(store),
    searchMemoriesTool(memoryDir),
    findBacklinksTool(memoryDir),
    suggestConnectionsTool(store, memoryDir),
    syncMemoriesTool(store),
  ];
}
