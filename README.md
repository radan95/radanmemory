# RadanMemory

Local-first knowledge graph MCP server for AI coding agents.

## Overview

RadanMemory creates a `.radanmemory/` folder in your project with markdown notes connected via [[wikilinks]]. AI assistants (Claude Code, Cursor, Codex, Windsurf) can read and write to it through the MCP protocol.

## Installation

```bash
npm install -g radanmemory
# or
npx radanmemory
```

## CLI Commands

```bash
# Initialize .radanmemory/ folder
radanmemory init

# Start MCP stdio server (default)
radanmemory server

# Sync with RadanMind cloud
radanmemory sync
radanmemory sync --direction push
radanmemory sync --direction pull
```

## MCP Configuration

### Claude Code

Add to your Claude Code configuration:

```json
{
  "mcpServers": {
    "radanmemory": {
      "type": "stdio",
      "command": "npx",
      "args": ["radanmemory"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "radanmemory": {
      "type": "stdio",
      "command": "npx radanmemory"
    }
  }
}
```

## MCP Tools

- `create_memory(title, content, tags?)` — Create a new note
- `read_memory(title)` — Read a note with backlinks
- `update_memory(title, content?, tags?)` — Update a note
- `delete_memory(title)` — Soft-delete a note
- `list_memories(tag?, limit?)` — List all notes
- `search_memories(query)` — Full-text search
- `find_backlinks(title)` — Find notes linking to this one
- `suggest_connections(title)` — Suggest related notes
- `sync_memories(direction?)` — Sync with RadanMind cloud

## MCP Tools (RadanMind Cloud — requires RADANMIND_API_KEY)

### Projects
- `create_project(name, description?)` — Create a new project
- `list_projects(limit?)` — List all projects (cached 5 min)
- `search_projects(query)` — Search projects by name/description
- `update_project(id, name?, description?)` — Update project
- `delete_project(id)` — Delete project

### Tasks
- `create_task(project_id, instructions, task_knowledge?, status?)` — Create task
- `list_tasks(project_id?, status?, limit?)` — List tasks (cached 5 min)
- `search_tasks(query, project_id?, status?)` — Search tasks
- `get_task(id)` — Get specific task
- `update_task(id, instructions?, status?)` — Update task
- `delete_task(id)` — Delete task

### Agents
- `create_agent(project_id, name, system_prompt)` — Create agent
- `list_agents(project_id?, limit?)` — List agents (cached 5 min)
- `get_agent(id)` — Get specific agent
- `update_agent(id, name?, system_prompt?)` — Update agent
- `delete_agent(id)` — Delete agent

## Cloud Sync (Optional)

Set `RADANMIND_API_KEY` environment variable to enable cloud sync:

When `RADANMIND_API_KEY` is set, RadanMemory also exposes project, task, and agent management tools that proxy to RadanMind cloud.

```bash
export RADANMIND_API_KEY=rm_live_xxx
radanmemory sync
```

## Multi-Agent Orchestrator Mode

RadanMemory supports running as an HTTP server for multi-agent collaboration via SSE transport.

### Starting HTTP Mode

```bash
# Start HTTP server for multi-agent mode
radanmemory server --http --port 3000
```

The server exposes:
- `GET /sse` — SSE endpoint for MCP connections
- `POST /messages?sessionId=<id>` — Message endpoint
- `GET /health` — Health check

### Connecting Agents via HTTP

**Claude Code / Codex MCP Configuration:**

```json
{
  "mcpServers": {
    "radanmemory": {
      "type": "http",
      "url": "http://127.0.0.1:3000/sse"
    }
  }
}
```

Multiple agents can connect to the same HTTP server and collaborate on shared memory.

### Orchestrator Tools (HTTP Mode Only)

When running in HTTP mode, the following additional tools are available:

- `workspace_create_task(title, description, tags?)` — Create a task in the shared queue
- `claim_task(taskId)` — Claim a task for the current agent
- `complete_task(taskId)` — Mark a claimed task as completed
- `fail_task(taskId, reason)` — Mark a claimed task as failed
- `workspace_list_tasks(status?, limit?)` — List tasks in the queue
- `acquire_lock(title, ttl?)` — Acquire a pessimistic lock (default TTL: 300s)
- `release_lock(title)` — Release a lock
- `get_activity_feed(limit?)` — Get recent activity events

### Optimistic Locking

To prevent lost updates when multiple agents edit the same memory, use `expected_checksum`:

1. Read the memory: `read_memory(title)` → returns `checksum`
2. Update with checksum: `update_memory(title, content, expected_checksum="sha256:...")`
3. If the memory changed since reading, the update is rejected with a conflict error

This ensures safe concurrent editing without blocking readers.

### Task Queue Lifecycle

```
pending → claim_task → active → complete_task → completed
                              → fail_task → failed
```

Tasks automatically expire if claimed but not completed within 30 minutes, returning to `pending` state.

### Activity Feed

The `get_activity_feed` tool returns recent events including:
- `memory:created`, `memory:updated`, `memory:deleted`
- `task:created`, `task:claimed`, `task:completed`, `task:failed`

Use this to stay aware of what other agents are doing.

## License

MIT
