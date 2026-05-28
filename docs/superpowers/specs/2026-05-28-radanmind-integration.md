# RadanMemory ↔ RadanMind Integration Design

**Date:** 2026-05-28
**Status:** Draft

## Overview

RadanMemory (lokalni MCP server) će se transparentno povezivati na RadanMind (cloud MCP server) tako da AI agenti vide samo jedan unified interface. Svi alati rade lokalno-first, ali automatski padaju na cloud kada podatak ne postoji lokalno.

## Goals

- **Transparentnost:** Claude Code / Cursor / druge AI aplikacije vide samo RadanMemory, ne znaju za postojanje cloud-a
- **Local-first:** Uvek se prvo čita/piše lokalno; cloud je fallback i backup
- **Unified search/search:** `search_memories` i `list_memories` vraćaju merged rezultate iz lokalnog storage-a i cloud-a
- **Bi-directional sync:** `sync_memories` šalje lokalne promene na cloud i povlači nove cloud memorije lokalno
- **RadanSpace-ready:** RadanSpace koristi RadanMemory kao jedini knowledge source, bez posebne konfiguracije za cloud

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent (Claude Code)                  │
│                         MCP Client                         │
└──────────────────────────┬──────────────────────────────────┘
                           │ stdio
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     RadanMemory (MCP Server)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ MemoryStore  │  │ RadanMind    │  │ Tool Handlers    │  │
│  │ (local FS)   │◄─┤ Client       │◄─┤ (create, read,   │  │
│  │              │  │ (HTTP/MCP)   │  │  search, etc.)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / MCP
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      RadanMind (Cloud)                       │
│                 Private MCP Server / API                     │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. RadanMindClient

Novi modul `src/radanmind-client.ts` koji se povezuje na RadanMind.

**Interface:**
```typescript
interface RadanMindClientConfig {
  endpoint: string;        // npr. "https://api.radanmind.com/mcp"
  apiKey: string;           // RADANMIND_API_KEY
  timeout?: number;       // default: 30s
}

class RadanMindClient {
  constructor(config: RadanMindClientConfig);
  
  // Cloud CRUD
  async read(title: string): Promise<Memory | null>;
  async list(tag?: string, limit?: number): Promise<MemoryMetadata[]>;
  async search(query: string): Promise<SearchResult[]>;
  
  // Sync
  async push(memories: SyncMemory[]): Promise<SyncResult>;
  async pull(since?: string): Promise<SyncMemory[]>;
}
```

**Protocol:** Koristi HTTP sa JSON-RPC 2.0 (kao postojeći SyncClient) ili direktno MCP client SDK ako RadanMind izlaže MCP preko HTTP/SSE.

### 2. Unified Tool Handlers

Postojeći tool handleri se proširuju da provere cloud kao fallback:

**`read_memory`:**
1. Pročitaj lokalno (`store.read()`)
2. Ako ne postoji lokalno, probaj cloud (`radanMindClient.read()`)
3. Ako postoji u cloud-u, prikaži ga sa indikatorom `[cloud]`
4. Ako nigde ne postoji, throw "not found"

**`list_memories`:**
1. Uzmi lokalne memorije (`store.list()`)
2. Uzmi cloud memorije (`radanMindClient.list()`)
3. Merge: cloud memorije koje NE postoje lokalno se dodaju u listu
4. Sortiraj po `updated` desc

**`search_memories`:**
1. Pretraži lokalno (`searchMemories()`)
2. Paralelno pretraži cloud (`radanMindClient.search()`)
3. Merge rezultate, deduplikuj po title, zbiraj score-ove
4. Sortiraj po score desc

**`find_backlinks` / `suggest_connections`:**
1. Izgradi lokalni backlink index
2. Dopuni sa cloud backlinkovima (ako RadanMind podržava)
3. Merge rezultate

### 3. Sync Strategy

Postojeći `SyncClient` se refaktoriše ili zamenjuje sa `RadanMindClient`.

**Push:**
- Šalje sve lokalne memorije na cloud
- Koristi content checksum za deduplikaciju

**Pull:**
- Povlači nove/izmenjene memorije sa cloud-a
- Kreira lokalne fajlove za cloud-only memorije
- Ne overwrite-uje lokalne ako su noviji (timestamp comparison)

**Bidirectional sync:**
- Uvek push pa pull (push lokalne promene, pull nove cloud stvari)
- Konflikti se rešavaju: **poslednji write wins** (po `updated` timestamp-u)

### 4. Configuration

Korisnik konfiguriše RadanMind preko environment variable:

```bash
export RADANMIND_API_KEY=rm_live_xxx
export RADANMIND_ENDPOINT=https://api.radanmind.com/mcp  # optional, ima default
```

Ako nema API key-a, RadanMemory radi 100% lokalno (isto kao sada).

## Data Flow

### Create Memory
```
AI Agent → create_memory(title, content, tags)
    → MemoryStore.create() [lokalno]
    → Ako je autoSync enabled → RadanMindClient.push() [cloud]
    → Vrati lokalni Memory
```

### Read Memory
```
AI Agent → read_memory(title)
    → MemoryStore.read() [lokalno]
    → Ako ne postoji → RadanMindClient.read() [cloud]
    → Vrati Memory (lokalni ili cloud)
```

### Search Memories
```
AI Agent → search_memories(query)
    → searchMemories() [lokalno] + RadanMindClient.search() [cloud] (paralelno)
    → MergeResults()
    → Vrati unified SearchResult[]
```

### Manual Sync
```
AI Agent → sync_memories(direction="both")
    → RadanMindClient.push() [šalje lokalne]
    → RadanMindClient.pull() [povlači cloud]
    → Vrati SyncResult sa brojevima i konfliktima
```

## Security

- API key se čuva isključivo kao environment variable, nikad u kodu ili config fajlovima
- Svi pozivi ka cloud-u koriste HTTPS
- Lokalni fajlovi koji se povuku sa cloud-a prolaze kroz iste safety provere (sanitizeTitle, assertFileSize, checkSymlink)
- Cloud memorije koje se prikažu lokalno imaju prefix `[cloud]` u metadata da korisnik zna odakle su

## Error Handling

- Ako je cloud nedostupan, alati rade samo lokalno (degraded mode)
- Ako je API key nevažeći, `sync_memories` baca grešku; ostali alati rade lokalno
- Network timeout: 30s default, retry 3x sa exponential backoff
- Konflikti se beleže u `SyncResult.conflicts` i ne blokiraju ostale operacije

## Testing

1. **Unit testovi** za `RadanMindClient` (mock HTTP server)
2. **Integration testovi** za unified tool handlers (lokalno + mock cloud)
3. **Offline test:** sve alate pokrenuti bez API key-a (samo lokalno)
4. **Cloud fallback test:** izbrisati lokalni fajl, proveriti da li `read_memory` vraća cloud verziju

## Implementation Order

1. **Phase 1:** `RadanMindClient` modul (HTTP klijent za cloud CRUD)
2. **Phase 2:** Proširiti `read_memory` i `list_memories` sa cloud fallback
3. **Phase 3:** Proširiti `search_memories` sa paralelnim cloud pretragom
4. **Phase 4:** Refaktorisati `sync_memories` da koristi novi `RadanMindClient`
5. **Phase 5:** Dodati autoSync opciju (npr. sync svakih 5 minuta u pozadini)

## Open Questions

1. Da li RadanMind podržava `find_backlinks` i `suggest_connections` direktno, ili samo basic CRUD?
2. Koji je tačan endpoint RadanMind MCP servera?
3. Da li treba offline queue (ako je cloud nedostupan, queue-uj push za kasnije)?

---

**Decision:** Svejedno nam je implementirati svejedno — krenuti sa Phase 1 (RadanMindClient) i graditi iterativno.
