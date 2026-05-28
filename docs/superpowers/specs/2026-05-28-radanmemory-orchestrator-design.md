# RadanMemory Orchestrator Design Spec

**Date:** 2026-05-28
**Status:** Approved for implementation
**Scope:** Transform RadanMemory from single-agent MCP stdio server into multi-agent workspace orchestrator

---

## 1. Overview

### Current State
RadanMemory is a local-first knowledge graph MCP server that stores memories as markdown files in `.radanmemory/`. It communicates via stdio transport, serving a single AI agent per process.

### Goal
Enable multiple AI agents (Claude Code, Codex, etc.) to work collaboratively on the same project by promoting RadanMemory to a **central workspace orchestrator** when running in HTTP mode.

### Key Capabilities Added
- **Optimistic locking** via checksums — prevents write conflicts without blocking
- **Task queue** — coordinate who works on what
- **Real-time event bus** — all agents see changes instantly
- **Activity feed** — history of who did what and when
- **MCP over HTTP/SSE** — standard protocol, network-accessible

### Backward Compatibility
The existing stdio MCP mode continues to work exactly as before. No breaking changes to existing functionality.

---

## 2. Architecture

### 2.1 Deployment Modes

| Mode | Command | Transport | Use Case |
|------|---------|-----------|----------|
| **stdio (default)** | `radanmemory server` | MCP stdio | Single agent, local |
| **HTTP orchestrator** | `radanmemory server --http --port 3000` | MCP over HTTP/SSE | Multi-agent workspace |

### 2.2 System Diagram

```
Mode A: stdio (existing, unchanged)
┌──────────┐      stdio      ┌─────────────────┐     fs     ┌─────────────┐
│  Agent   │ ◄──────────────► │ RadanMemory     │ ◄──────► │ .radanmemory│
│  (1)     │                  │ (stdio process) │          │ / fajlovi   │
└──────────┘                  └─────────────────┘          └─────────────┘

Mode B: HTTP orchestrator (new)
┌──────────┐     HTTP/SSE     ┌─────────────────────────────────┐
│ Agent A  │ ◄───────────────► │                                 │
│ (Claude) │                   │   RadanMemory Orchestrator      │
└──────────┘                   │   ┌─────────────┐               │     ┌─────────────┐
                               │   │ HTTP        │               │     │ .radanmemory│
┌──────────┐     HTTP/SSE     │   │ Transport   │               │     │ / fajlovi   │
│ Agent B  │ ◄───────────────► │   │ (SSE)       │               │     └─────────────┘
│ (Codex)  │                   │   ├─────────────┤               │     ┌─────────────┐
└──────────┘                   │   │ Session     │               │     │ .radanmemory│
                               │   │ Manager     │               │     │ /.orch/     │
┌──────────┐     HTTP/SSE     │   ├─────────────┤               │     │ / state     │
│ Agent C  │ ◄───────────────► │   │ Lock        │               │     └─────────────┘
│ (Claude) │                   │   │ Manager     │               │
└──────────┘                   │   ├─────────────┤               │
                               │   │ Task Queue  │               │
┌──────────┐     HTTP/SSE     │   ├─────────────┤               │
│ Agent D  │ ◄───────────────► │   │ Event Bus   │               │
│ (Codex)  │                   │   └─────────────┘               │
└──────────┘                   └─────────────────────────────────┘
```

### 2.3 New Components

| Component | File | Responsibility |
|-----------|------|--------------|
| **HTTP Transport** | `src/transports/http.ts` | Express server with SSE endpoint for MCP protocol |
| **Session Manager** | `src/session.ts` | Track active MCP sessions (one per connected agent) |
| **Lock Manager** | `src/locks.ts` | Optimistic checksum validation; pessimistic lock fallback |
| **Task Queue** | `src/tasks.ts` | Manage task lifecycle: pending → claimed → completed/failed |
| **Event Bus** | `src/events.ts` | In-memory pub/sub; broadcast to all SSE connections |
| **Orchestrator Persistence** | `.radanmemory/.orchestrator/` | JSON files for crash recovery |

### 2.4 Orchestrator State Files

Stored in `.radanmemory/.orchestrator/`:

| File | Format | Content |
|------|--------|---------|
| `locks.json` | JSON object | Current pessimistic locks: `{title: {agentId, acquiredAt, ttl}}` |
| `tasks.json` | JSON array | All tasks: `{id, title, description, status, assignee, createdAt, completedAt}` |
| `events.jsonl` | JSON Lines | Append-only event log for history |
| `agents.json` | JSON object | Registered agents: `{agentId: {name, connectedAt, lastSeen}}` |

On server startup, these files are loaded to reconstruct state. On every mutating operation, they are rewritten atomically (write to temp file, then rename).

---

## 3. Optimistic Locking Protocol

### 3.1 Philosophy
Agents do not explicitly lock files. Instead, every write includes the checksum the agent saw when it last read the file. If the file changed in the meantime, the write is rejected.

### 3.2 Protocol Flow

```
Agent: read_memory(title="auth-pattern")
  → Server: returns { content, checksum: "sha256:abc123..." }

[Agent works, modifies content locally]

Agent: update_memory(
    title="auth-pattern",
    content="new content...",
    expected_checksum="sha256:abc123..."
  )
  → Server: compute current checksum
  → If matches: update succeeds, return new checksum
  → If mismatch: return CONFLICT error

Agent on CONFLICT:
  → Re-read file (get latest content + checksum)
  → Re-apply changes (or ask user)
  → Retry with new expected_checksum
```

### 3.3 Checksum Algorithm
SHA-256 of file content (excluding frontmatter for stability). Stored as hex string prefixed with `sha256:`.

### 3.4 Pessimistic Fallback
Available via explicit `acquire_lock` / `release_lock` tools for edge cases where optimistic locking is insufficient (e.g., long-running multi-file operations).

---

## 4. Task Queue

### 4.1 Task Lifecycle

```
┌─────────┐    claim     ┌──────────┐   complete   ┌───────────┐
│ PENDING │ ───────────► │ ACTIVE   │ ──────────► │ COMPLETED │
└─────────┘              └──────────┘             └───────────┘
                              │
                              │ fail
                              ▼
                         ┌──────────┐
                         │ FAILED   │
                         └──────────┘
```

### 4.2 Task Properties

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (uuid) | Unique identifier |
| `title` | string | Human-readable task name |
| `description` | string | Detailed instructions |
| `status` | enum | `pending`, `active`, `completed`, `failed` |
| `assignee` | string? | Agent ID who claimed it |
| `createdAt` | ISO timestamp | When task was created |
| `claimedAt` | ISO timestamp? | When agent claimed it |
| `completedAt` | ISO timestamp? | When finished |
| `failedReason` | string? | If status is `failed`, why |

### 4.3 Task Operations

| Operation | Tool | Who calls |
|-----------|------|-----------|
| Create task | `create_task` | Any agent or human |
| Claim task | `claim_task` | Agent that wants to work on it |
| Complete task | `complete_task` | Agent that claimed it |
| Fail task | `fail_task` | Agent that claimed it |
| List tasks | `list_tasks` | Any agent (sees all) |

### 4.4 Assignment Rules
- A task can only be claimed by one agent at a time
- Only the claiming agent can complete or fail it
- Tasks auto-expire if not completed within 30 minutes (configurable)
- Failed tasks return to `pending` with `failedReason` preserved in history

---

## 5. Event Bus

### 5.1 Event Types

| Event Type | Payload | Description |
|-----------|---------|-------------|
| `memory:created` | `{title, author, timestamp}` | New note created |
| `memory:updated` | `{title, author, timestamp}` | Note content changed |
| `memory:deleted` | `{title, author, timestamp}` | Note soft-deleted |
| `lock:acquired` | `{title, agentId, ttl}` | Pessimistic lock taken |
| `lock:released` | `{title, agentId}` | Pessimistic lock freed |
| `task:created` | `{taskId, title, createdBy}` | New task added |
| `task:claimed` | `{taskId, agentId}` | Agent started working |
| `task:completed` | `{taskId, agentId}` | Agent finished |
| `task:failed` | `{taskId, agentId, reason}` | Agent failed |
| `agent:connected` | `{agentId, name}` | New agent joined |
| `agent:disconnected` | `{agentId}` | Agent left |

### 5.2 Delivery
Events are delivered to all connected agents via SSE (Server-Sent Events). Agents can filter by subscribing to specific event patterns (e.g., `memory:*` or `task:*`).

### 5.3 Persistence
All events are appended to `.radanmemory/.orchestrator/events.jsonl` for history and crash recovery.

---

## 6. MCP Tool Changes

### 6.1 New Tools (HTTP mode only)

| Tool | Parameters | Returns |
|------|-----------|---------|
| `create_task` | `title, description, [tags]` | `{taskId, status}` |
| `claim_task` | `taskId` | `{success, expiresAt}` |
| `complete_task` | `taskId, [summary]` | `{success}` |
| `fail_task` | `taskId, reason` | `{success}` |
| `list_tasks` | `[status, limit]` | `{tasks[]}` |
| `acquire_lock` | `title, [ttl=300]` | `{success, expiresAt}` |
| `release_lock` | `title` | `{success}` |
| `get_activity_feed` | `[limit=50, [since]]` | `{events[]}` |

### 6.2 Modified Tools

| Tool | Change | Reason |
|------|--------|--------|
| `update_memory` | Adds optional `expected_checksum` | Optimistic locking |
| `create_memory` | Adds `author` to frontmatter | Attribution |
| `delete_memory` | Adds `author` to frontmatter | Attribution |

### 6.3 Unchanged Tools

All other existing tools (`read_memory`, `list_memories`, `search_memories`, `find_backlinks`, `suggest_connections`, `get_graph`, `sync_memories`) work identically in both stdio and HTTP modes.

---

## 7. HTTP Transport Details

### 7.1 Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sse` | GET | SSE endpoint for MCP messages (client connects here) |
| `/messages` | POST | Endpoint for client-to-server MCP messages |
| `/health` | GET | Health check (returns 200 if server alive) |

### 7.2 MCP over SSE Protocol

Follows the Model Context Protocol specification for HTTP transport:

1. Client opens SSE connection to `/sse`
2. Server sends endpoint URL for POST messages
3. Client sends JSON-RPC messages via POST to that endpoint
4. Server pushes responses and notifications via SSE events

### 7.3 Session Management

Each SSE connection gets a unique `sessionId`. Sessions are tracked in memory and persisted to `agents.json`. If an agent disconnects unexpectedly, its pessimistic locks are auto-released after TTL.

---

## 8. Configuration

### 8.1 CLI Flags

```bash
# stdio mode (backward compatible)
radanmemory server

# HTTP orchestrator mode
radanmemory server --http --port 3000

# With optional cloud sync
radanmemory server --http --port 3000 --sync-interval 300

# With custom memory directory
radanmemory server --http --port 3000 --memory-dir ./custom
```

### 8.2 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RADANMEMORY_HTTP_PORT` | `3000` | HTTP server port |
| `RADANMEMORY_SYNC_INTERVAL` | `0` (off) | Auto-sync interval in seconds |
| `RADANMEMORY_TASK_TIMEOUT` | `1800` | Task auto-expiry in seconds |
| `RADANMEMORY_LOCK_TTL` | `300` | Default pessimistic lock TTL in seconds |
| `RADANMEMORY_MAX_EVENTS` | `10000` | Max events to keep in memory |

### 8.3 Client Configuration

**Claude Code / Codex MCP config:**

```json
{
  "mcpServers": {
    "radanmemory": {
      "url": "http://localhost:3000/sse"
    }
  }
}
```

---

## 9. Error Handling

### 9.1 New Error Codes

| Code | HTTP Status | When |
|------|-------------|------|
| `CONFLICT` | 409 | Optimistic locking failed (checksum mismatch) |
| `LOCKED` | 423 | Pessimistic lock held by another agent |
| `TASK_CLAIMED` | 409 | Task already claimed by another agent |
| `TASK_NOT_CLAIMED` | 400 | Attempt to complete/fail unclaimed task |
| `NOT_AUTHORIZED` | 403 | Agent trying to complete task it didn't claim |

### 9.2 Recovery

- **Server crash:** On restart, load state from `.radanmemory/.orchestrator/*.json` files
- **Agent disconnect:** Release its pessimistic locks after TTL expires
- **Checksum conflict:** Client must re-read file and re-apply changes

---

## 10. Testing Strategy

### 10.1 Unit Tests

| Component | What to test |
|-----------|-------------|
| `LockManager` | Acquire, release, TTL expiry, concurrent attempts |
| `TaskQueue` | Create, claim, complete, fail, expiry, list filtering |
| `EventBus` | Subscribe, publish, filter patterns, persist |
| `SessionManager` | Connect, disconnect, heartbeat, cleanup |
| `HttpTransport` | SSE connection, message routing, error handling |

### 10.2 Integration Tests

| Scenario | How |
|----------|-----|
| Two agents read same file | Both get same checksum |
| Agent A updates, Agent B updates with stale checksum | B gets CONFLICT |
| Agent A claims task, Agent B tries to claim same | B gets TASK_CLAIMED |
| Server crash and restart | State reconstructed from files |
| Event broadcast | All connected agents receive event |

### 10.3 End-to-End Test

1. Start RadanMemory in HTTP mode
2. Connect 2 mock MCP clients
3. Client A creates memory → Client B receives event
4. Client A reads memory (remembers checksum)
5. Client B updates same memory
6. Client A tries update with stale checksum → gets CONFLICT
7. Client A re-reads, merges, succeeds
8. Create task, claim, complete → verify state

---

## 11. Implementation Phases

### Phase 1: Foundation (Day 1)
- [ ] Create `src/transports/http.ts` with Express + SSE
- [ ] Implement `SessionManager` in `src/session.ts`
- [ ] Add `--http` and `--port` CLI flags
- [ ] Wire HTTP transport into existing MCP server
- [ ] Verify stdio mode still works (backward compat test)

### Phase 2: Locking & Attribution (Day 2)
- [ ] Add checksum computation to `MemoryStore`
- [ ] Modify `update_memory` to accept `expected_checksum`
- [ ] Add `author` field to frontmatter on create/update/delete
- [ ] Implement optimistic locking with CONFLICT errors
- [ ] Add pessimistic fallback (`acquire_lock`, `release_lock`)

### Phase 3: Task Queue (Day 3)
- [ ] Implement `TaskQueue` in `src/tasks.ts`
- [ ] Add task tools: `create_task`, `claim_task`, `complete_task`, `fail_task`, `list_tasks`
- [ ] Task expiry logic with configurable TTL
- [ ] Task history and filtering

### Phase 4: Event Bus (Day 4)
- [ ] Implement `EventBus` in `src/events.ts`
- [ ] Hook into all mutating operations (memory CRUD, task changes, locks)
- [ ] SSE event delivery to all connected sessions
- [ ] Event filtering by pattern
- [ ] Event persistence to `events.jsonl`

### Phase 5: Orchestrator State & Recovery (Day 5)
- [ ] Implement state persistence layer for locks, tasks, agents
- [ ] Atomic file writes (write temp → rename)
- [ ] State loading on server startup
- [ ] Recovery tests (kill -9 server, verify state on restart)

### Phase 6: Integration & Polish (Day 6-7)
- [ ] End-to-end test with 2+ mock clients
- [ ] Real test with Claude Code + Codex
- [ ] Error handling edge cases
- [ ] Performance tuning (event batching, connection pooling)
- [ ] Documentation update

---

## 12. Open Questions (Resolved During Design)

| Question | Decision |
|----------|----------|
| Transport for multi-agent? | MCP over HTTP/SSE (standard protocol) |
| stdio mode preserved? | Yes, default mode, no breaking changes |
| Locking strategy? | Optimistic (checksum) with pessimistic fallback |
| State persistence? | JSON files in `.radanmemory/.orchestrator/` |
| Task expiry? | 30 minutes default, configurable |
| Event retention? | Append-only JSONL, no automatic pruning (manual for now) |

---

## 13. Success Criteria

- [ ] Multiple agents can connect simultaneously via HTTP/SSE
- [ ] Optimistic locking prevents lost updates without blocking
- [ ] Task queue coordinates work between agents
- [ ] Real-time events notify all agents of changes
- [ ] Server crash recovery restores full state
- [ ] stdio mode continues to work identically to before
- [ ] All new functionality covered by tests
- [ ] End-to-end demo with 2+ agents working on same project

---

*Spec written: 2026-05-28*
*Approved by: user*
*Next step: Invoke writing-plans skill to create implementation plan*
