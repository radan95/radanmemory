import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';
import { RadanMindProxy } from '../radanmind-proxy.js';
import { CloudCache } from '../cloud-cache.js';
import { createMemoryTool } from './create-memory.js';
import { readMemoryTool } from './read-memory.js';
import { updateMemoryTool } from './update-memory.js';
import { deleteMemoryTool } from './delete-memory.js';
import { listMemoriesTool } from './list-memories.js';
import { searchMemoriesTool } from './search-memories.js';
import { findBacklinksTool } from './find-backlinks.js';
import { suggestConnectionsTool } from './suggest-connections.js';
import { syncMemoriesTool } from './sync-memories.js';
import { createProjectTool } from './create-project.js';
import { listProjectsTool } from './list-projects.js';
import { searchProjectsTool } from './search-projects.js';
import { updateProjectTool } from './update-project.js';
import { deleteProjectTool } from './delete-project.js';
import { createTaskTool } from './create-task.js';
import { listTasksTool } from './list-tasks.js';
import { searchTasksTool } from './search-tasks.js';
import { getTaskTool } from './get-task.js';
import { updateTaskTool } from './update-task.js';
import { deleteTaskTool } from './delete-task.js';
import { createAgentTool } from './create-agent.js';
import { listAgentsTool } from './list-agents.js';
import { getAgentTool } from './get-agent.js';
import { updateAgentTool } from './update-agent.js';
import { deleteAgentTool } from './delete-agent.js';

export function registerAllTools(store: MemoryStore, memoryDir: string): ToolDefinition[] {
  const tools: ToolDefinition[] = [
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

  const apiKey = process.env.RADANMIND_API_KEY;
  if (apiKey) {
    const proxy = new RadanMindProxy({ apiKey });
    const cache = new CloudCache(memoryDir);
    tools.push(
      createProjectTool(proxy, cache),
      listProjectsTool(proxy, cache),
      searchProjectsTool(proxy),
      updateProjectTool(proxy, cache),
      deleteProjectTool(proxy, cache),
      createTaskTool(proxy, cache),
      listTasksTool(proxy, cache),
      searchTasksTool(proxy),
      getTaskTool(proxy),
      updateTaskTool(proxy, cache),
      deleteTaskTool(proxy, cache),
      createAgentTool(proxy, cache),
      listAgentsTool(proxy, cache),
      getAgentTool(proxy),
      updateAgentTool(proxy, cache),
      deleteAgentTool(proxy, cache),
    );
  }

  return tools;
}
