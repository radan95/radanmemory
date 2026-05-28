# RadanMemory — Design Spec

## Overview
RadanMemory je lokalni knowledge graph MCP server — živi `.radanmemory/` folder
sa markdown fajlovima povezanim [[wikilink]] sintaksom. AI asistenti (Claude Code,
Cursor, Codex, Windsurf) čitaju i pišu u njega preko stdio MCP protokola.

## Stack
- Node.js + TypeScript
- @modelcontextprotocol/sdk
- Vitest (testovi)

## Folder structure
```
.radanmemory/            # Auto-discover: ide nagore od cwd
├── _index.md            # Opcioni indeks sa svim wikilinkovima
├── auth-pattern.md      # kebab-case nazivi
├── stripe-flow.md
└── _deleted/            # Soft delete destinacija
```

## 9 MCP alata

### create_memory(title, content, tags?)
- Kreira .radanmemory/{title}.md
- Greška ako već postoji

### read_memory(title)
- Vraća sadržaj, tags, linked notes, backlinks

### update_memory(title, content?, tags?)
- Ažurira fajl, overwrite sadržaja

### delete_memory(title)
- Move u .radanmemory/_deleted/{title}.md

### list_memories(tag?, limit?)
- Lista .md fajlova, filter po frontmatter tagovima

### search_memories(query)
- Full-text case-insensitive includes pretraga

### find_backlinks(title)
- Parsira sve .md fajlove, vraća ko linkuje ovaj

### suggest_connections(title)
- Predlaže povezane note-ove (dele tagove ili međusobno linkuju)

### sync_memories(direction?: "push" | "pull" | "both")
- Push: šalje promenjene fajlove na RadanMind (HTTP)
- Pull: skida sa RadanMind-a
- Both: bidirectional

## CLI komande
- `radanmemory` — pokreće MCP server (stdio)
- `radanmemory sync` — ručni sync sa cloud-om
- `radanmemory init` — kreira `.radanmemory/` i `_index.md`

## Safety
- Sanitizacija: /^[a-z0-9-_]+$/i
- Max 1MB po fajlu
- Max 10.000 fajlova
- Path traversal blokiran
- Permissions: 0644

## Project structure
```
radanmemory/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── README.md
├── src/
│   ├── index.ts              # CLI entry (commander)
│   ├── server.ts             # MCP server setup
│   ├── types.ts
│   ├── memory-store.ts       # FS CRUD
│   ├── wikilink-parser.ts    # [[wikilink]] regex
│   ├── search.ts             # Full-text search
│   ├── connector.ts          # suggest_connections
│   ├── discover.ts           # Auto-discovery
│   ├── safety.ts             # Sanitizacija, limiti
│   ├── sync.ts               # RadanMind sync
│   └── tools/
│       ├── index.ts          # Self-registration
│       ├── create-memory.ts
│       ├── read-memory.ts
│       ├── update-memory.ts
│       ├── delete-memory.ts
│       ├── list-memories.ts
│       ├── search-memories.ts
│       ├── find-backlinks.ts
│       ├── suggest-connections.ts
│       └── sync-memories.ts
└── __tests__/
    ├── wikilink-parser.test.ts
    ├── safety.test.ts
    ├── memory-store.test.ts
    └── tools.test.ts
```

## Monetizacija (buduća)
- Free: ceo lokalni RadanMemory (neograničeno)
- Pro ($xx/mo): cloud sync na RadanMind + dashboard graph viz
- Sync je opcioni — free korisnici ga jednostavno ne koriste
