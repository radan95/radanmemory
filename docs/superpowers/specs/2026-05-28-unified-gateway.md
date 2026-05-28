# RadanMemory as Unified MCP Gateway

**Date:** 2026-05-28
**Status:** Draft
**Replaces:** `2026-05-28-radanmind-integration.md`

## Overview

RadanMemory će biti jedini MCP server koji AI agenti vide. Interno, on obrađuje dve stvari:

1. **Lokalne memorije** — knowledge graph sa wikilinkovima (postojeća funkcionalnost)
2. **Cloud project/task/agent** — prosleđuje pozive ka RadanMind platformi

Ovo omogućava da se u RadanSpace i drugim projektima koristi SAMO jedan MCP endpoint.

## Goals

- AI agent konfiguriše **samo RadanMemory** — ne zna za postojanje dva sistema
- Memory alati rade lokalno-first (`.radanmemory/` folder)
- Project/task/agent alati se transparentno prosleđuju na RadanMind cloud
- Degraded mode: ako je cloud nedostupan, memory alati i dalje rade lokalno
- RadanSpace dobija "it just works" iskustvo bez posebne konfiguracije

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent (Claude Code)                  │
│                      MCP Client                             │
└──────────────────────────┬──────────────────────────────────┘
                           │ stdio
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    RadanMemory (MCP Server)                │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐   │
│  │ MemoryStore  │  │ Tool Handlers    │  │ RadanMind    │   │
│  │ (local FS)   │◄─┤                  │◄─┤ Proxy        │   │
│  │              │  │ • create_memory  │  │ (HTTP client)│   │
│  │ • create     │  │ • read_memory    │  │              │   │
│  │ • read       │  │ • search_memories│  │ • create_    │   │
│  │ • update     │  │ • list_memories  │  │   project    │   │
│  │ • delete     │  │ • ...            │  │ • list_tasks │   │
│  │ • search     │  │ • create_project │  │ • create_    │   │
│  │ • backlinks  │  │ • list_tasks     │  │   agent      │   │
│  └──────────────┘  │ • ...            │  └──────────────┘   │
│                    └──────────────────┘                     │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS + JSON-RPC 2.0
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    RadanMind (Cloud)                         │
│              Next.js /api/mcp endpoint                        │
│         Projects | Tasks | Agents | Auth | Audit             │
└─────────────────────────────────────────────────────────────┘
```

## Tool Categories

### 1. Memory Tools (Local)
Postojeći alati, bez promena:

| Alat | Scope |
|------|-------|
| `create_memory` | Lokalno |
| `read_memory` | Lokalno |
| `update_memory` | Lokalno |
| `delete_memory` | Lokalno |
| `list_memories` | Lokalno |
| `search_memories` | Lokalno |
| `find_backlinks` | Lokalno |
| `suggest_connections` | Lokalno |

### 2. Project Tools (Cloud Proxy)
Novi alati koji prosleđuju ka RadanMind:

| Alat | RadanMind Tool | Params |
|------|---------------|--------|
| `create_project` | `create_project` | name, description? |
| `list_projects` | `list_projects` | limit? |
| `update_project` | `update_project` | id, name?, description? |
| `delete_project` | `delete_project` | id |

### 3. Task Tools (Cloud Proxy)

| Alat | RadanMind Tool | Params |
|------|---------------|--------|
| `create_task` | `create_task` | project_id, instructions, task_knowledge?, status? |
| `list_tasks` | `list_tasks` | project_id?, status?, limit? |
| `get_task` | `get_task` | id |
| `update_task` | `update_task` | id, instructions?, status? |
| `delete_task` | `delete_task` | id |

### 4. Agent Tools (Cloud Proxy)

| Alat | RadanMind Tool | Params |
|------|---------------|--------|
| `create_agent` | `create_agent` | project_id, name, system_prompt |
| `list_agents` | `list_agents` | project_id?, limit? |
| `get_agent` | `get_agent` | id |
| `update_agent` | `update_agent` | id, name?, system_prompt? |
| `delete_agent` | `delete_agent` | id |

### 5. Sync Tool (Cloud)

| Alat | Šta radi |
|------|---------|
| `sync_memories` | Push lokalnih memories ka RadanMind (ako/support) |

## RadanMind Proxy Client

Novi modul: `src/radanmind-proxy.ts`

```typescript
interface RadanMindConfig {
  endpoint: string;      // default: https://radanmind.vercel.app/api/mcp
  apiKey: string;         // RADANMIND_API_KEY
  timeout?: number;      // default: 30s
}

class RadanMindProxy {
  constructor(config: RadanMindConfig);
  
  // Generic JSON-RPC call
  async call<T>(method: string, params?: Record<string, unknown>): Promise<T>;
  
  // Convenience methods
  async createProject(name: string, description?: string): Promise<unknown>;
  async listProjects(limit?: number): Promise<unknown[]>;
  async createTask(projectId: string, instructions: string, ...): Promise<unknown>;
  async listTasks(projectId?: string, ...): Promise<unknown[]>;
  async createAgent(projectId: string, name: string, systemPrompt: string): Promise<unknown>;
  async listAgents(projectId?: string): Promise<unknown[]>;
  // ... etc
}
```

**Protocol:** JSON-RPC 2.0 preko HTTP POST, sa `Authorization: Bearer <apiKey>` header-om.

## Configuration

```bash
# Required for cloud proxy features
export RADANMIND_API_KEY=rm_live_xxx

# Optional (has default)
export RADANMIND_ENDPOINT=https://radanmind.vercel.app/api/mcp
```

Ako nema `RADANMIND_API_KEY`:
- Memory alati rade normalno (lokalno)
- Project/task/agent alati baca grešku "RADANMIND_API_KEY not set"

## Error Handling

| Scenario | Ponašanje |
|----------|-----------|
| Cloud nedostupan | Project/task/agent alati bacaju error; memory alati rade normalno |
| API key nevažeći | Cloud alati bacaju "Unauthorized"; memory alati rade normalno |
| Rate limit | Cloud alati bacaju "Rate limit exceeded" |
| Invalid params | Validation error prosleđen ka agentu |

## Security

- `RADANMIND_API_KEY` se čuva isključivo kao env var
- Svi pozivi ka cloud-u idu preko HTTPS
- API key se ne loguje nigde
- Audit logovi na RadanMind strani (već postoji)

## Testing

1. **Offline test:** Bez API key-a, svi memory alati rade; cloud alati bacaju error
2. **Proxy test:** Sa mock HTTP serverom, proveriti da li se pozivi ispravno prosleđuju
3. **Round-trip test:** Kreirati project preko RadanMemory, proveriti na RadanMind dashboard-u
4. **Error propagation:** RadanMind vrati 4xx/5xx — proveriti da li RadanMemory ispravno propagira error

## Implementation Phases

### Phase 1: RadanMindProxy client
- `src/radanmind-proxy.ts` — generic JSON-RPC HTTP client
- Testovi sa mock serverom

### Phase 2: Project tools
- `src/tools/create-project.ts`
- `src/tools/list-projects.ts`
- `src/tools/update-project.ts`
- `src/tools/delete-project.ts`

### Phase 3: Task tools
- `src/tools/create-task.ts`
- `src/tools/list-tasks.ts`
- `src/tools/get-task.ts`
- `src/tools/update-task.ts`
- `src/tools/delete-task.ts`

### Phase 4: Agent tools
- `src/tools/create-agent.ts`
- `src/tools/list-agents.ts`
- `src/tools/get-agent.ts`
- `src/tools/update-agent.ts`
- `src/tools/delete-agent.ts`

### Phase 5: Sync (optional)
- Proširiti `sync_memories` da šalje i project/task/agent stanje

## Open Questions

1. Da li RadanMind ima i `search` alate (npr. `search_tasks`)? U trenutnom kodu ne vidim.
2. Da li želiš da RadanMind dobije i memory alate (da RadanMemory samo prosleđuje)?
3. Da li treba lokalni cache za project/task/agent podatke?

## Decision

Implementirati fazno, počevši od Phase 1 (RadanMindProxy client).
