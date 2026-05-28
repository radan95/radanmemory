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

## License

MIT
