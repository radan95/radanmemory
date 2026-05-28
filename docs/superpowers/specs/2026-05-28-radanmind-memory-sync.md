# RadanMind Memory Sync + Graph View Design

**Date:** 2026-05-28
**Status:** Draft

## Overview

RadanMemory će sync-ovati SAMO memorije (title, content, tags, links) na RadanMind cloud. RadanMind će:
1. Skladištiti memorije u novoj `memories` tabeli
2. Expose-ovati MCP alate za memory CRUD
3. Priakzivati graph view na dashboard-u (force-directed network wikilinkova)

## Architecture

```
Lokalno (.radanmemory/)          RadanMind Cloud
┌─────────────────┐              ┌──────────────────────────┐
│  auth-pattern.md│ ──sync──►  │  memories table          │
│  supabase-auth.md│             │  (title, content, tags,   │
│  [[wikilinks]]   │             │   links, user_id)        │
└─────────────────┘              │                          │
                                │  ┌────────────────────┐  │
                                │  │  /dashboard/graph  │  │
                                │  │  Force-directed    │  │
                                │  │  D3.js graph       │  │
                                │  └────────────────────┘  │
                                └──────────────────────────┘
```

## RadanMind Changes

### 1. Database Schema (Supabase)

```sql
-- Memories table
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL UNIQUE (per user),
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  links TEXT[] DEFAULT '{}',
  checksum TEXT NOT NULL, -- SHA256 of content
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_memories_user_id ON memories(user_id);
CREATE INDEX idx_memories_title ON memories(title);
CREATE INDEX idx_memories_tags ON memories USING GIN(tags);
CREATE INDEX idx_memories_links ON memories USING GIN(links);

-- Full-text search
CREATE INDEX idx_memories_fts ON memories USING GIN (to_tsvector('english', content));

-- RLS
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own memories" ON memories
  FOR ALL USING (auth.uid() = user_id);

-- Updated at trigger
CREATE TRIGGER update_memories_updated_at BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2. New MCP Tools (RadanMind)

Add to existing MCP tool registry in `src/lib/mcp/tools/`:

| Tool | Method | Params |
|------|--------|--------|
| `create_memory` | POST | title, content, tags?, links? |
| `read_memory` | GET | title |
| `update_memory` | PUT | title, content?, tags?, links? |
| `delete_memory` | DELETE | title |
| `list_memories` | GET | tag?, limit? |
| `search_memories` | GET | query |
| `sync_memories` | POST | memories[] (batch upsert) |

**sync_memories** (ključan za RadanMemory sync):
```json
{
  "memories": [
    {
      "title": "auth-pattern",
      "content": "...",
      "tags": ["auth"],
      "links": ["supabase-auth"],
      "checksum": "sha256...",
      "updated": "2026-05-28T..."
    }
  ]
}
```

Logic:
- Upsert po `(user_id, title)`
- Skip if checksum matches (no changes)
- Update if checksum differs
- Return: `{ created: N, updated: N, unchanged: N }`

### 3. Graph View Page

**Route:** `/dashboard/graph`

**Components:**
- `GraphCanvas` — D3.js force-directed simulation
- `NodePanel` — sidebar sa detaljima selektovanog čvora
- `SearchBar` — pretraga memorija
- `FilterTags` — filter po tagovima

**D3.js Graph:**
- **Čvorovi:** memories (title kao label)
- **Veze:** `links` array (wikilinkovi)
- **Boja čvorova:** po tagu (npr. auth=red, security=plavo)
- **Veličina čvorova:** broj incoming linkova (backlinks)
- **Interakcija:**
  - Drag čvorova
  - Click → prikaži content u sidebar-u
  - Hover → highlight povezane čvorove
  - Zoom/pan

**Data fetch:**
```typescript
// Server component
const { data: memories } = await supabase
  .from('memories')
  .select('title, content, tags, links')
  .eq('user_id', user.id);

// Transform for D3
const nodes = memories.map(m => ({ id: m.title, tags: m.tags, radius: calculateRadius(m) }));
const links = memories.flatMap(m => 
  m.links.map(target => ({ source: m.title, target }))
).filter(l => memories.some(m => m.title === l.target)); // only existing targets
```

## RadanMemory Changes

### 1. Update SyncClient

Modify `src/sync.ts` — trenutno šalje ka `sync_memories` endpointu, ali treba da:
- Pročita sve lokalne memorije
- Generiše checksum za svaku
- Pošalje batch na RadanMind `sync_memories`
- Prikaže rezultate

```typescript
// Novi sync payload
interface SyncMemoryPayload {
  title: string;
  content: string;
  tags: string[];
  links: string[];
  checksum: string;
  updated: string;
}
```

### 2. Nova CLI komanda (opciono)

```bash
radanmemory sync --watch  # auto-sync svakih 5 minuta
```

## Implementation Order

### Faza 1: RadanMind Database + MCP Tools
1. Supabase migration za `memories` tabelu
2. MCP tools: create_memory, read_memory, update_memory, delete_memory
3. MCP tools: list_memories, search_memories
4. MCP tool: sync_memories (batch upsert)
5. Testovi za MCP tools

### Faza 2: RadanMemory Sync Update
1. Update `SyncClient` da šalje kompletan memory payload
2. Dodati `links` u sync payload (iz wikilink parsera)
3. Testiranje sync-a

### Faza 3: RadanMind Graph View
1. D3.js instalacija (`npm install d3`)
2. `/dashboard/graph` page
3. `GraphCanvas` komponenta (force-directed simulation)
4. `NodePanel` sidebar
5. Search i filter funkcionalnost
6. Responsive dizajn

### Faza 4: Integracija + Testiranje
1. End-to-end test: kreiraj memory lokalno → sync → pogledaj na graphu
2. Performance test sa 100+ memorija
3. Mobile responsive provera

## Technical Details

### D3.js Force Simulation

```typescript
import * as d3 from 'd3';

const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).id(d => d.id).distance(100))
  .force('charge', d3.forceManyBody().strength(-300))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collision', d3.forceCollide().radius(d => d.radius + 10));
```

### Styling

- Dark theme (kao ostatak dashboarda)
- Čvorovi: circle sa tag bojom
- Linkovi: subtle sive linije
- Hover: brightness boost
- Selected: ring highlight
- Sidebar: slide-in from right

## Security

- RLS: user_id filter na svim queries
- API key auth: isti mehanizam kao postojeći MCP tools
- XSS: sanitizacija content-a pri renderovanju (D3 text, ne HTML)

## Performance

- Graph renderuje max 200 čvorova (paginacija ako više)
- Debounced search (300ms)
- Memoizovani node calculations
- Virtual scrolling za sidebar listu

## Open Questions

1. Da li treba "neighborhood" view (prikaži samo čvor i njegove linkove)?
2. Da li treba editovanje direktno iz graph-a (double-click → edit)?
3. Treba li graph history (undo/redo pozicije)?

## Decision

Implementirati fazno, počevši od Faza 1 (database + MCP tools).
