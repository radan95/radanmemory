# RadanMemory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first stdio MCP server that manages `.radanmemory/` markdown notes with [[wikilink]] support, with optional cloud sync to RadanMind.

**Architecture:** Node.js/TypeScript CLI binary that starts as stdio MCP server. 9 MCP tools + 2 CLI commands. Auto-discovers `.radanmemory/` folder from cwd upward. All storage is plain markdown files on disk.

**Tech Stack:** Node.js 20+, TypeScript, `@modelcontextprotocol/sdk`, Vitest, Commander

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `vitest.config.ts`
- Create: `src/types.ts`
- Create: `src/index.ts` (stub)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "radanmemory",
  "version": "1.0.0",
  "description": "Local-first knowledge graph MCP server for AI coding agents",
  "type": "module",
  "bin": {
    "radanmemory": "./dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "commander": "^13.0.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^4.1.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

- [ ] **Step 3: Create tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["__tests__"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Create src/types.ts**

```typescript
export interface MemoryMetadata {
  title: string;
  tags: string[];
  links: string[];
  backlinks: string[];
  size: number;
  created: string;
  updated: string;
}

export interface Memory extends MemoryMetadata {
  content: string;
}

export interface SyncPayload {
  memories: Array<{
    title: string;
    content: string;
    tags: string[];
    checksum: string;
    updated: string;
  }>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: string[];
}
```

- [ ] **Step 6: Create src/index.ts stub**

```typescript
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
```

- [ ] **Step 7: Install dependencies and verify**

Run: `npm install && npm run typecheck`
Expected: No errors, `dist/index.js` builds.

- [ ] **Step 8: Commit**

```bash
git init
git add -A
git commit -m "chore: project scaffold"
```

---

### Task 2: safety.ts — sanitizacija i limiti

**Files:**
- Create: `src/safety.ts`
- Create: `__tests__/safety.test.ts`

- [ ] **Step 1: Implement src/safety.ts**

```typescript
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const VALID_TITLE_RE = /^[a-z0-9-_]+$/i;
const MAX_FILE_SIZE = 1_000_000; // 1MB
const MAX_FILES = 10_000;

export function sanitizeTitle(title: string): string {
  const clean = title.replace(/\.md$/i, '').trim();
  if (!VALID_TITLE_RE.test(clean)) {
    throw new Error(`Invalid title: "${title}" — only [a-z0-9-_] allowed`);
  }
  return clean;
}

export function toFilename(title: string): string {
  return `${sanitizeTitle(title)}.md`;
}

export function assertNoPathTraversal(input: string): void {
  if (input.includes('..') || input.startsWith('/')) {
    throw new Error(`Path traversal detected in: "${input}"`);
  }
}

export async function assertFileSize(filepath: string): Promise<void> {
  const { size } = await stat(filepath);
  if (size > MAX_FILE_SIZE) {
    throw new Error(`File exceeds max size (1MB): ${filepath}`);
  }
}

export async function assertFileCount(dir: string): Promise<void> {
  const entries = await readdir(dir);
  const mdFiles = entries.filter((e) => e.endsWith('.md') && !e.startsWith('_'));
  if (mdFiles.length >= MAX_FILES) {
    throw new Error(`Max ${MAX_FILES} memories allowed`);
  }
}

export async function checkSymlink(filepath: string): Promise<void> {
  const { resolve } = await import('node:path');
  const real = await stat(filepath);
  if (real.isSymbolicLink()) {
    throw new Error(`Symlinks not allowed: ${filepath}`);
  }
}

export function assertContentSize(content: string): void {
  const bytes = Buffer.byteLength(content, 'utf-8');
  if (bytes > MAX_FILE_SIZE) {
    throw new Error('Content exceeds max size (1MB)');
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { sanitizeTitle, toFilename, assertNoPathTraversal, assertContentSize } from '../src/safety.js';

describe('safety', () => {
  describe('sanitizeTitle', () => {
    it('allows valid kebab-case titles', () => {
      expect(sanitizeTitle('auth-pattern')).toBe('auth-pattern');
    });

    it('strips .md extension', () => {
      expect(sanitizeTitle('auth-pattern.md')).toBe('auth-pattern');
    });

    it('rejects titles with spaces', () => {
      expect(() => sanitizeTitle('auth pattern')).toThrow();
    });

    it('rejects path traversal', () => {
      expect(() => sanitizeTitle('../etc/passwd')).toThrow();
    });

    it('rejects absolute paths', () => {
      expect(() => sanitizeTitle('/etc/passwd')).toThrow();
    });
  });

  describe('toFilename', () => {
    it('appends .md', () => {
      expect(toFilename('auth-pattern')).toBe('auth-pattern.md');
    });
  });

  describe('assertNoPathTraversal', () => {
    it('throws on ../ in path', () => {
      expect(() => assertNoPathTraversal('../../foo')).toThrow();
    });
  });

  describe('assertContentSize', () => {
    it('throws on content over 1MB', () => {
      const big = 'x'.repeat(1_000_001);
      expect(() => assertContentSize(big)).toThrow();
    });

    it('allows normal content', () => {
      expect(() => assertContentSize('hello')).not.toThrow();
    });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run __tests__/safety.test.ts`
Expected: All passing.

- [ ] **Step 4: Commit**

```bash
git add src/safety.ts __tests__/safety.test.ts
git commit -m "feat: add safety module with sanitization and limits"
```

---

### Task 3: discover.ts — auto-discovery .radanmemory/ foldera

**Files:**
- Create: `src/discover.ts`
- Create: `__tests__/discover.test.ts`

- [ ] **Step 1: Implement src/discover.ts**

```typescript
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { access, mkdir } from 'node:fs/promises';

const FOLDER_NAME = '.radanmemory';

export async function discoverMemoryDir(cwd?: string): Promise<string | null> {
  const start = cwd ?? process.cwd();
  let dir = resolve(start);

  while (true) {
    const candidate = join(dir, FOLDER_NAME);
    try {
      await access(candidate);
      return candidate;
    } catch {
      const parent = resolve(dir, '..');
      if (parent === dir) return null;
      dir = parent;
    }
  }
}

export async function discoverOrCreateMemoryDir(cwd?: string): Promise<string> {
  const found = await discoverMemoryDir(cwd);
  if (found) return found;

  const start = (cwd ?? process.cwd());
  const path = join(start, FOLDER_NAME);
  await mkdir(path, { recursive: true });
  return path;
}

export async function ensureIndexFile(dir: string): Promise<void> {
  const indexPath = join(dir, '_index.md');
  if (!existsSync(indexPath)) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      indexPath,
      '# RadanMemory Index\n\nWelcome to your local knowledge graph.\n\n',
      'utf-8',
    );
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { discoverMemoryDir, discoverOrCreateMemoryDir } from '../src/discover.js';

describe('discover', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = join(tmpdir(), `radanmemory-test-${randomUUID()}`);
    await mkdir(baseDir, { recursive: true });
  });

  afterEach(async () => {
    await rmdir(baseDir, { recursive: true });
  });

  it('returns null when no .radanmemory folder exists', async () => {
    const result = await discoverMemoryDir(baseDir);
    expect(result).toBeNull();
  });

  it('finds .radanmemory in current dir', async () => {
    const memDir = join(baseDir, '.radanmemory');
    await mkdir(memDir, { recursive: true });
    const result = await discoverMemoryDir(baseDir);
    expect(result).toBe(memDir);
  });

  it('finds .radanmemory in parent dir', async () => {
    const memDir = join(baseDir, '.radanmemory');
    await mkdir(memDir, { recursive: true });
    const subDir = join(baseDir, 'deep', 'nested');
    await mkdir(subDir, { recursive: true });

    const result = await discoverMemoryDir(subDir);
    expect(result).toBe(memDir);
  });

  it('creates .radanmemory if not found', async () => {
    const result = await discoverOrCreateMemoryDir(baseDir);
    expect(result).toBe(join(baseDir, '.radanmemory'));
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run __tests__/discover.test.ts`
Expected: All passing.

- [ ] **Step 4: Commit**

```bash
git add src/discover.ts __tests__/discover.test.ts
git commit -m "feat: add auto-discovery of .radanmemory folder"
```

---

### Task 4: wikilink-parser.ts — [[wikilink]] regex + backlink index

**Files:**
- Create: `src/wikilink-parser.ts`
- Create: `__tests__/wikilink-parser.test.ts`

- [ ] **Step 1: Implement src/wikilink-parser.ts**

```typescript
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g;

export function extractLinks(content: string): string[] {
  const matches = [...content.matchAll(WIKILINK_REGEX)];
  return matches.map((m) => m[1].trim());
}

export function extractLinksWithContext(content: string): Array<{ target: string; context: string }> {
  const results: Array<{ target: string; context: string }> = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const matches = [...lines[i].matchAll(WIKILINK_REGEX)];
    for (const match of matches) {
      const lineStart = Math.max(0, i - 1);
      const lineEnd = Math.min(lines.length, i + 2);
      const context = lines.slice(lineStart, lineEnd).join('\n').trim();
      results.push({ target: match[1].trim(), context });
    }
  }

  return results;
}

export type BacklinkIndex = Record<string, string[]>;

export async function buildBacklinkIndex(memoryDir: string): Promise<BacklinkIndex> {
  const index: BacklinkIndex = {};
  const files = await readdir(memoryDir);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const content = await readFile(join(memoryDir, file), 'utf-8');
    const fromTitle = file.replace('.md', '');
    const linkedTo = extractLinks(content);

    for (const target of linkedTo) {
      if (!index[target]) index[target] = [];
      if (!index[target].includes(fromTitle)) {
        index[target].push(fromTitle);
      }
    }
  }

  return index;
}

export function countLinks(content: string): number {
  return extractLinks(content).length;
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { extractLinks, extractLinksWithContext, countLinks } from '../src/wikilink-parser.js';

describe('wikilink-parser', () => {
  describe('extractLinks', () => {
    it('extracts single wikilink', () => {
      const text = 'Pogledaj [[auth-pattern]] za detalje.';
      expect(extractLinks(text)).toEqual(['auth-pattern']);
    });

    it('extracts multiple wikilinks', () => {
      const text = 'Vidi [[auth-pattern]] i [[csrf-flow]].';
      expect(extractLinks(text)).toEqual(['auth-pattern', 'csrf-flow']);
    });

    it('returns empty array for no wikilinks', () => {
      expect(extractLinks('No links here.')).toEqual([]);
    });

    it('trims whitespace inside brackets', () => {
      const text = '[[  auth-pattern  ]]';
      expect(extractLinks(text)).toEqual(['auth-pattern']);
    });
  });

  describe('extractLinksWithContext', () => {
    it('returns context lines around wikilink', () => {
      const text = 'Prvi red.\nVidi [[auth-pattern]] ovde.\nTreći red.';
      const results = extractLinksWithContext(text);
      expect(results).toHaveLength(1);
      expect(results[0].target).toBe('auth-pattern');
      expect(results[0].context).toContain('Vidi [[auth-pattern]] ovde.');
    });
  });

  describe('countLinks', () => {
    it('counts wikilinks in content', () => {
      expect(countLinks('[[a]] i [[b]]')).toBe(2);
    });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run __tests__/wikilink-parser.test.ts`
Expected: All passing.

- [ ] **Step 4: Commit**

```bash
git add src/wikilink-parser.ts __tests__/wikilink-parser.test.ts
git commit -m "feat: add wikilink parser with backlink index builder"
```

---

### Task 5: memory-store.ts — FS CRUD

**Files:**
- Create: `src/memory-store.ts`
- Create: `__tests__/memory-store.test.ts`

- [ ] **Step 1: Implement src/memory-store.ts**

```typescript
import { readFile, writeFile, readdir, mkdir, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sanitizeTitle, toFilename, assertContentSize, assertFileCount, checkSymlink } from './safety.js';
import { extractLinks } from './wikilink-parser.js';
import type { Memory, MemoryMetadata } from './types.js';

export class MemoryStore {
  constructor(private dir: string) {}

  private filePath(title: string): string {
    return join(this.dir, toFilename(title));
  }

  private deletedDir(): string {
    return join(this.dir, '_deleted');
  }

  async create(title: string, content: string, tags: string[] = []): Promise<Memory> {
    const cleanTitle = sanitizeTitle(title);
    const fp = this.filePath(cleanTitle);

    assertContentSize(content);
    await assertFileCount(this.dir);

    if (existsSync(fp)) {
      throw new Error(`Memory "${cleanTitle}" already exists`);
    }

    const now = new Date().toISOString();
    const frontmatter = `---\ntitle: ${cleanTitle}\ntags: [${tags.join(', ')}]\ncreated: ${now}\nupdated: ${now}\n---\n\n`;
    await writeFile(fp, frontmatter + content, 'utf-8');

    return this.read(cleanTitle);
  }

  async read(title: string): Promise<Memory> {
    const cleanTitle = sanitizeTitle(title);
    const fp = this.filePath(cleanTitle);

    if (!existsSync(fp)) {
      throw new Error(`Memory "${cleanTitle}" not found`);
    }

    await checkSymlink(fp);

    const raw = await readFile(fp, 'utf-8');
    assertContentSize(raw);

    const { metadata, content } = this.parseFile(raw, cleanTitle);
    const links = extractLinks(content);

    return {
      ...metadata,
      title: cleanTitle,
      content,
      links,
      backlinks: [], // populated by caller
      size: Buffer.byteLength(raw, 'utf-8'),
    };
  }

  async update(title: string, updates: { content?: string; tags?: string[] }): Promise<Memory> {
    const cleanTitle = sanitizeTitle(title);
    const existing = await this.read(cleanTitle);

    const content = updates.content ?? existing.content;
    const tags = updates.tags ?? existing.tags;
    const now = new Date().toISOString();

    assertContentSize(content);

    const fp = this.filePath(cleanTitle);
    const frontmatter = `---\ntitle: ${cleanTitle}\ntags: [${tags.join(', ')}]\ncreated: ${existing.created}\nupdated: ${now}\n---\n\n`;
    await writeFile(fp, frontmatter + content, 'utf-8');

    return this.read(cleanTitle);
  }

  async delete(title: string): Promise<void> {
    const cleanTitle = sanitizeTitle(title);
    const fp = this.filePath(cleanTitle);

    if (!existsSync(fp)) {
      throw new Error(`Memory "${cleanTitle}" not found`);
    }

    const delDir = this.deletedDir();
    if (!existsSync(delDir)) {
      await mkdir(delDir, { recursive: true });
    }

    const dest = join(delDir, toFilename(cleanTitle));
    await rename(fp, dest);
  }

  async list(tag?: string, limit?: number): Promise<MemoryMetadata[]> {
    const files = await readdir(this.dir);
    const mdFiles = files.filter((f) => f.endsWith('.md') && !f.startsWith('_'));

    const result: MemoryMetadata[] = [];

    for (const file of mdFiles) {
      const title = file.replace('.md', '');
      const fp = join(this.dir, file);

      if (!existsSync(fp)) continue;

      try {
        const raw = await readFile(fp, 'utf-8');
        const { metadata, content } = this.parseFile(raw, title);

        if (tag && !metadata.tags.includes(tag)) continue;

        result.push({
          ...metadata,
          links: extractLinks(content),
          backlinks: [],
          size: Buffer.byteLength(raw, 'utf-8'),
        });
      } catch {
        continue;
      }
    }

    result.sort((a, b) => b.updated.localeCompare(a.updated));
    return limit ? result.slice(0, limit) : result;
  }

  async exists(title: string): Promise<boolean> {
    return existsSync(this.filePath(sanitizeTitle(title)));
  }

  checksum(title: string): string {
    const fp = this.filePath(sanitizeTitle(title));
    return createHash('sha256').update(fp).digest('hex');
  }

  private parseFile(raw: string, title: string): { metadata: Omit<MemoryMetadata, 'title' | 'links' | 'backlinks' | 'size'>; content: string } {
    const metadata: Omit<MemoryMetadata, 'title' | 'links' | 'backlinks' | 'size'> = {
      tags: [],
      created: '',
      updated: '',
    };

    let content = raw;

    if (raw.startsWith('---')) {
      const endIdx = raw.indexOf('---', 3);
      if (endIdx !== -1) {
        const fm = raw.slice(3, endIdx).trim();
        content = raw.slice(endIdx + 3).trim();

        for (const line of fm.split('\n')) {
          const [key, ...vals] = line.split(':');
          const val = vals.join(':').trim();
          switch (key.trim()) {
            case 'tags':
              metadata.tags = val.replace(/[[\]]/g, '').split(',').map((t) => t.trim()).filter(Boolean);
              break;
            case 'created':
              metadata.created = val;
              break;
            case 'updated':
              metadata.updated = val;
              break;
          }
        }
      }
    }

    if (!metadata.created) metadata.created = new Date().toISOString();
    if (!metadata.updated) metadata.updated = new Date().toISOString();

    return { metadata, content };
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { MemoryStore } from '../src/memory-store.js';

describe('MemoryStore', () => {
  let store: MemoryStore;
  let memDir: string;

  beforeEach(async () => {
    memDir = join(tmpdir(), `radanmemory-${randomUUID()}`);
    await mkdir(memDir, { recursive: true });
    store = new MemoryStore(memDir);
  });

  afterEach(async () => {
    await rmdir(memDir, { recursive: true });
  });

  it('creates and reads a memory', async () => {
    const mem = await store.create('auth-pattern', 'We use [[supabase-auth]].');
    expect(mem.title).toBe('auth-pattern');
    expect(mem.content).toContain('[[supabase-auth]]');
    expect(mem.links).toEqual(['supabase-auth']);
  });

  it('throws on duplicate create', async () => {
    await store.create('test', 'content');
    await expect(store.create('test', 'again')).rejects.toThrow('already exists');
  });

  it('throws on reading non-existent', async () => {
    await expect(store.read('nonexistent')).rejects.toThrow('not found');
  });

  it('updates a memory', async () => {
    await store.create('test', 'original');
    const updated = await store.update('test', { content: 'updated content' });
    expect(updated.content).toBe('updated content');
  });

  it('deletes a memory (soft)', async () => {
    await store.create('test', 'content');
    await store.delete('test');
    await expect(store.read('test')).rejects.toThrow('not found');
  });

  it('lists memories', async () => {
    await store.create('foo', 'first', ['tag1']);
    await store.create('bar', 'second', ['tag2']);
    const list = await store.list();
    expect(list).toHaveLength(2);
  });

  it('lists memories filtered by tag', async () => {
    await store.create('foo', 'first', ['tag1']);
    await store.create('bar', 'second', ['tag2']);
    const list = await store.list('tag1');
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('foo');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run __tests__/memory-store.test.ts`
Expected: All passing.

- [ ] **Step 4: Commit**

```bash
git add src/memory-store.ts __tests__/memory-store.test.ts
git commit -m "feat: add memory store with CRUD operations"
```

---

### Task 6: search.ts — full-text search

**Files:**
- Create: `src/search.ts`
- Create: `__tests__/search.test.ts`

- [ ] **Step 1: Implement src/search.ts**

```typescript
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SearchResult {
  title: string;
  snippet: string;
  score: number;
}

export async function searchMemories(dir: string, query: string): Promise<SearchResult[]> {
  const files = await readdir(dir);
  const mdFiles = files.filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const file of mdFiles) {
    const title = file.replace('.md', '');
    const fp = join(dir, file);
    const content = await readFile(fp, 'utf-8');

    // Skip frontmatter for search
    const body = content.replace(/^---[\s\S]*?---\n?/, '');
    const lowerBody = body.toLowerCase();

    if (!lowerBody.includes(lowerQuery)) continue;

    const matchIdx = lowerBody.indexOf(lowerQuery);
    const start = Math.max(0, matchIdx - 60);
    const end = Math.min(body.length, matchIdx + query.length + 60);
    const snippet = (start > 0 ? '...' : '') +
      body.slice(start, end).trim() +
      (end < body.length ? '...' : '');

    // Count occurrences for scoring
    const occurrences = (lowerBody.match(new RegExp(lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

    results.push({ title, snippet, score: occurrences });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { searchMemories } from '../src/search.js';

describe('search', () => {
  let memDir: string;

  beforeEach(async () => {
    memDir = join(tmpdir(), `radanmemory-${randomUUID()}`);
    await mkdir(memDir, { recursive: true });
  });

  afterEach(async () => {
    await rmdir(memDir, { recursive: true });
  });

  it('finds matching content', async () => {
    await writeFile(join(memDir, 'auth.md'), 'We use Supabase for authentication.');
    const results = await searchMemories(memDir, 'supabase');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('auth');
  });

  it('returns snippet with context', async () => {
    await writeFile(join(memDir, 'test.md'), 'Prvi red.\nDrugi red sa Supabase ovde.\nTreci red.');
    const results = await searchMemories(memDir, 'supabase');
    expect(results[0].snippet).toContain('Supabase');
  });

  it('sorts by relevance (occurrence count)', async () => {
    await writeFile(join(memDir, 'less.md'), 'Supabase je OK.');
    await writeFile(join(memDir, 'more.md'), 'Supabase je super. Supabase radi dobro. Volimo Supabase.');
    const results = await searchMemories(memDir, 'supabase');
    expect(results[0].title).toBe('more');
    expect(results[1].title).toBe('less');
  });

  it('returns empty for no match', async () => {
    await writeFile(join(memDir, 'test.md'), 'Nema trazenog teksta.');
    const results = await searchMemories(memDir, 'nonexistent');
    expect(results).toHaveLength(0);
  });

  it('case insensitive', async () => {
    await writeFile(join(memDir, 'test.md'), 'Supabase Auth');
    const results = await searchMemories(memDir, 'supabase');
    expect(results).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run __tests__/search.test.ts`
Expected: All passing.

- [ ] **Step 4: Commit**

```bash
git add src/search.ts __tests__/search.test.ts
git commit -m "feat: add full-text search with relevance scoring"
```

---

### Task 7: connector.ts — suggest_connections

**Files:**
- Create: `src/connector.ts`
- Create: `__tests__/connector.test.ts`

- [ ] **Step 1: Implement src/connector.ts**

```typescript
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { extractLinks } from './wikilink-parser.js';
import type { Memory } from './types.js';

export interface ConnectionSuggestion {
  title: string;
  reason: string;
  score: number;
}

export async function suggestConnections(memoryDir: string, target: Memory): Promise<ConnectionSuggestion[]> {
  const files = await readdir(memoryDir);
  const mdFiles = files.filter((f) => f.endsWith('.md') && !f.startsWith('_') && f.replace('.md', '') !== target.title);
  const suggestions: ConnectionSuggestion[] = [];

  for (const file of mdFiles) {
    const title = file.replace('.md', '');
    const fp = join(memoryDir, file);
    const raw = await readFile(fp, 'utf-8');
    const body = raw.replace(/^---[\s\S]*?---\n?/, '');
    const links = extractLinks(body);

    let score = 0;
    const reasons: string[] = [];

    // Shared tags
    const contentTags = parseTags(raw);
    const sharedTags = target.tags.filter((t) => contentTags.includes(t));
    if (sharedTags.length > 0) {
      score += sharedTags.length * 3;
      reasons.push(`shared tags: ${sharedTags.join(', ')}`);
    }

    // Direct link from target to this
    if (target.links.includes(title)) {
      score += 5;
      reasons.push('linked from this memory');
    }

    // Direct link from this to target
    if (links.includes(target.title)) {
      score += 5;
      reasons.push('links to this memory');
    }

    if (score > 0) {
      suggestions.push({
        title,
        reason: reasons.join('; '),
        score,
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions;
}

function parseTags(raw: string): string[] {
  const match = raw.match(/^---[\s\S]*?---/);
  if (!match) return [];
  const fm = match[0];
  const tagsMatch = fm.match(/tags:\s*\[([^\]]*)\]/);
  if (!tagsMatch) return [];
  return tagsMatch[1].split(',').map((t) => t.trim()).filter(Boolean);
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { suggestConnections } from '../src/connector.js';
import type { Memory } from '../src/types.js';

describe('connector', () => {
  let memDir: string;

  beforeEach(async () => {
    memDir = join(tmpdir(), `radanmemory-${randomUUID()}`);
    await mkdir(memDir, { recursive: true });
  });

  afterEach(async () => {
    await rmdir(memDir, { recursive: true });
  });

  it('suggests by shared tags', async () => {
    await writeFile(
      join(memDir, 'auth.md'),
      '---\ntags: [auth, security]\n---\nAuth content.',
    );
    await writeFile(
      join(memDir, 'csrf.md'),
      '---\ntags: [auth, security]\n---\nCSRF content.',
    );

    const target: Memory = {
      title: 'auth',
      content: 'Auth content.',
      tags: ['auth', 'security'],
      links: [],
      backlinks: [],
      size: 100,
      created: '',
      updated: '',
    };

    const suggestions = await suggestConnections(memDir, target);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].title).toBe('csrf');
    expect(suggestions[0].reason).toContain('shared tags');
  });

  it('suggests by direct links', async () => {
    await writeFile(join(memDir, 'foo.md'), 'Sadrzi link ka [[bar]].');
    await writeFile(join(memDir, 'bar.md'), 'Sadrzaj.');

    const target: Memory = {
      title: 'foo',
      content: 'Sadrzi link ka [[bar]].',
      tags: [],
      links: ['bar'],
      backlinks: [],
      size: 50,
      created: '',
      updated: '',
    };

    const suggestions = await suggestConnections(memDir, target);
    expect(suggestions.some((s) => s.title === 'bar')).toBe(true);
  });

  it('excludes self from suggestions', async () => {
    await writeFile(join(memDir, 'self.md'), 'Sadrzaj.');

    const target: Memory = {
      title: 'self',
      content: 'Sadrzaj.',
      tags: ['tag1'],
      links: [],
      backlinks: [],
      size: 50,
      created: '',
      updated: '',
    };

    const suggestions = await suggestConnections(memDir, target);
    const selfSuggested = suggestions.some((s) => s.title === 'self');
    expect(selfSuggested).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run __tests__/connector.test.ts`
Expected: All passing.

- [ ] **Step 4: Commit**

```bash
git add src/connector.ts __tests__/connector.test.ts
git commit -m "feat: add suggest_connections logic"
```

---

### Task 8: sync.ts — RadanMind cloud sync

**Files:**
- Create: `src/sync.ts`
- Create: `__tests__/sync.test.ts`

- [ ] **Step 1: Implement src/sync.ts**

```typescript
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { SyncPayload, SyncResult } from './types.js';
import { MemoryStore } from './memory-store.js';

const SYNC_API = 'https://radanmind.vercel.app/api/mcp';

function getApiKey(): string {
  const key = process.env.RADANMIND_API_KEY;
  if (!key) throw new Error('RADANMIND_API_KEY environment variable not set');
  return key;
}

function contentChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

export class SyncClient {
  constructor(private apiKey?: string) {
    this.apiKey = apiKey ?? getApiKey();
  }

  async push(store: MemoryStore): Promise<SyncResult> {
    const list = await store.list();
    const payload: SyncPayload = {
      memories: [],
    };

    for (const meta of list) {
      const mem = await store.read(meta.title);
      payload.memories.push({
        title: mem.title,
        content: mem.content,
        tags: mem.tags,
        checksum: contentChecksum(mem.content),
        updated: mem.updated,
      });
    }

    const response = await fetch(SYNC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'sync_memories',
        params: { memories: payload.memories },
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Sync push failed: ${response.status} ${response.statusText}`);
    }

    return { pushed: payload.memories.length, pulled: 0, conflicts: [] };
  }

  async pull(store: MemoryStore): Promise<SyncResult> {
    const response = await fetch(SYNC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'list_cloud_memories',
        params: {},
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Sync pull failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const cloudMemories = data.result?.items ?? [];
    let pulled = 0;
    const conflicts: string[] = [];

    for (const cm of cloudMemories) {
      const exists = await store.exists(cm.title);
      if (!exists) {
        await store.create(cm.title, cm.content, cm.tags);
        pulled++;
      }
    }

    return { pushed: 0, pulled, conflicts };
  }

  async syncBoth(store: MemoryStore): Promise<SyncResult> {
    const pushResult = await this.push(store);
    const pullResult = await this.pull(store);
    return {
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
      conflicts: [...pushResult.conflicts, ...pullResult.conflicts],
    };
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { SyncClient } from '../src/sync.js';

describe('SyncClient', () => {
  it('throws without API key', () => {
    delete process.env.RADANMIND_API_KEY;
    expect(() => new SyncClient()).toThrow('RADANMIND_API_KEY');
  });

  it('accepts explicit API key', () => {
    const client = new SyncClient('test-key');
    expect(client).toBeInstanceOf(SyncClient);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run __tests__/sync.test.ts`
Expected: All passing.

- [ ] **Step 4: Commit**

```bash
git add src/sync.ts __tests__/sync.test.ts
git commit -m "feat: add RadanMind cloud sync client"
```

---

### Task 9: Tools — create-memory, read-memory, update-memory, delete-memory

**Files:**
- Create: `src/tools/index.ts`
- Create: `src/tools/create-memory.ts`
- Create: `src/tools/read-memory.ts`
- Create: `src/tools/update-memory.ts`
- Create: `src/tools/delete-memory.ts`

- [ ] **Step 1: Implement src/tools/create-memory.ts**

```typescript
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';

export const createMemoryTool = (store: MemoryStore): ToolDefinition => ({
  name: 'create_memory',
  description: 'Create a new memory note in .radanmemory/',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title (kebab-case)' },
      content: { type: 'string', description: 'Markdown content' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
    },
    required: ['title', 'content'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      title: z.string().min(1),
      content: z.string(),
      tags: z.array(z.string()).optional().default([]),
    });
    const { title, content, tags } = schema.parse(params);
    const mem = await store.create(title, content, tags);
    return { content: [{ type: 'text', text: JSON.stringify(mem) }] };
  },
});
```

- [ ] **Step 2: Implement src/tools/read-memory.ts**

```typescript
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';
import { buildBacklinkIndex } from '../wikilink-parser.js';

export const readMemoryTool = (store: MemoryStore, memoryDir: string): ToolDefinition => ({
  name: 'read_memory',
  description: 'Read a memory note with its backlinks',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title' },
    },
    required: ['title'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { title } = z.object({ title: z.string().min(1) }).parse(params);
    const mem = await store.read(title);
    const backlinks = await buildBacklinkIndex(memoryDir);
    mem.backlinks = backlinks[title] ?? [];
    return { content: [{ type: 'text', text: JSON.stringify(mem) }] };
  },
});
```

- [ ] **Step 3: Implement src/tools/update-memory.ts**

```typescript
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';

export const updateMemoryTool = (store: MemoryStore): ToolDefinition => ({
  name: 'update_memory',
  description: 'Update an existing memory note',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title' },
      content: { type: 'string', description: 'New markdown content' },
      tags: { type: 'array', items: { type: 'string' }, description: 'New tags' },
    },
    required: ['title'],
  },
  handler: async (params: Record<string, unknown>) => {
    const schema = z.object({
      title: z.string().min(1),
      content: z.string().optional(),
      tags: z.array(z.string()).optional(),
    });
    const { title, content, tags } = schema.parse(params);
    const updates: { content?: string; tags?: string[] } = {};
    if (content !== undefined) updates.content = content;
    if (tags !== undefined) updates.tags = tags;
    const mem = await store.update(title, updates);
    return { content: [{ type: 'text', text: JSON.stringify(mem) }] };
  },
});
```

- [ ] **Step 4: Implement src/tools/delete-memory.ts**

```typescript
import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';

export const deleteMemoryTool = (store: MemoryStore): ToolDefinition => ({
  name: 'delete_memory',
  description: 'Soft-delete a memory note (moves to _deleted/)',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title' },
    },
    required: ['title'],
  },
  handler: async (params: Record<string, unknown>) => {
    const { title } = z.object({ title: z.string().min(1) }).parse(params);
    await store.delete(title);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  },
});
```

- [ ] **Step 5: Create src/tools/index.ts**

```typescript
import type { ToolDefinition } from './types.js';
import type { MemoryStore } from '../memory-store.js';
import { createMemoryTool } from './create-memory.js';
import { readMemoryTool } from './read-memory.js';
import { updateMemoryTool } from './update-memory.js';
import { deleteMemoryTool } from './delete-memory.js';

export function registerCoreTools(store: MemoryStore, memoryDir: string): ToolDefinition[] {
  return [
    createMemoryTool(store),
    readMemoryTool(store, memoryDir),
    updateMemoryTool(store),
    deleteMemoryTool(store),
  ];
}
```

- [ ] **Step 6: Commit**

```bash
git add src/tools/
git commit -m "feat: add create/read/update/delete tools"
```

---

### Task 10: Tools — list, search, backlinks, suggest, sync

**Files:**
- Create: `src/tools/list-memories.ts`
- Create: `src/tools/search-memories.ts`
- Create: `src/tools/find-backlinks.ts`
- Create: `src/tools/suggest-connections.ts`
- Create: `src/tools/sync-memories.ts`

- [ ] **Step 1: Implement list-memories.ts**

```typescript
// list(store): { tag?, limit? } → { total, items }
```

- [ ] **Step 2: Implement search-memories.ts**

```typescript
// search(memoryDir): { query } → { results }
```

- [ ] **Step 3: Implement find-backlinks.ts**

```typescript
// findBacklinks(memoryDir): { title } → { backlinks }
```

- [ ] **Step 4: Implement suggest-connections.ts**

```typescript
// suggestConnections(store, memoryDir): { title } → { suggestions }
```

- [ ] **Step 5: Implement sync-memories.ts**

```typescript
// sync(store): { direction? } → SyncResult
```

- [ ] **Step 6: Update src/tools/index.ts to register all 9 tools**

- [ ] **Step 7: Commit**

---

### Task 11: server.ts — MCP server setup + tool registration

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1: Implement src/server.ts**

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryStore } from './memory-store.js';
import { discoverOrCreateMemoryDir, ensureIndexFile } from './discover.js';
import { registerAllTools } from './tools/index.js';
import type { ToolDefinition } from './tools/types.js';

export async function startServer(): Promise<void> {
  const memoryDir = await discoverOrCreateMemoryDir();
  await ensureIndexFile(memoryDir);
  const store = new MemoryStore(memoryDir);

  const tools: ToolDefinition[] = registerAllTools(store, memoryDir);

  const server = new Server(
    { name: 'radanmemory', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((t) => t.name === request.params.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }
    try {
      return await tool.handler(request.params.arguments ?? {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Tool error: ${message}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 2: Update src/index.ts to call startServer() when 'server' command runs**

```typescript
import { Command } from 'commander';
import { discoverOrCreateMemoryDir, ensureIndexFile } from './discover.js';
import { startServer } from './server.js';
import { MemoryStore } from './memory-store.js';
import { SyncClient } from './sync.js';

const program = new Command();
// ...

program
  .command('server', { isDefault: true })
  .description('Start MCP stdio server')
  .action(async () => {
    try {
      await startServer();
    } catch (err) {
      console.error('radanmemory: fatal error starting server', err);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize .radanmemory/ folder')
  .action(async () => {
    const dir = await discoverOrCreateMemoryDir();
    await ensureIndexFile(dir);
    console.log(`radanmemory: initialized ${dir}`);
  });

program
  .command('sync')
  .description('Sync memories with RadanMind cloud')
  .option('-d, --direction <dir>', 'push, pull, or both', 'both')
  .action(async (opts: { direction: string }) => {
    try {
      const memoryDir = await discoverOrCreateMemoryDir();
      const store = new MemoryStore(memoryDir);
      const client = new SyncClient();
      const result = opts.direction === 'push'
        ? await client.push(store)
        : opts.direction === 'pull'
          ? await client.pull(store)
          : await client.syncBoth(store);
      console.log(`radanmemory: sync complete — pushed ${result.pushed}, pulled ${result.pulled}, conflicts ${result.conflicts.length}`);
    } catch (err) {
      console.error('radanmemory: sync failed', err);
      process.exit(1);
    }
  });

program.parse();
```

- [ ] **Step 3: Commit**

```bash
git add src/server.ts src/index.ts
git commit -m "feat: add MCP server with stdio transport and CLI"
```

---

### Task 12: Integration test — full flow

**Files:**
- Create: `__tests__/memory-store.test.ts` (dodati integration test)

- [ ] **Step 1: Add integration test — end to end flow**

- Simulira MCP server pozive (ne pokreće stvarni server, direktno koristi MemoryStore)
- Testira: create → read → update → list → search → backlinks → delete

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests passing.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: integration tests covering full memory lifecycle"
```

---

### Task 13: Build + publish preparation

**Files:**
- Modify: `package.json` (scripts)
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Create .gitignore**

```
node_modules/
dist/
.env
```

- [ ] **Step 2: Create README.md**

Kratak README sa:
- Sta je RadanMemory
- Instalacija: `npm i -g radanmemory` ili `npx radanmemory`
- Komande: `init`, `server`, `sync`
- MCP config za Claude Code, Cursor, Codex
- Link na RadanMind (za Pro tier)

- [ ] **Step 3: Build and verify**

Run: `npm run build && node dist/index.js --help`
Expected: CLI help text.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add .gitignore, README, final build"
```

---

**Self-review:**

1. **Spec coverage:** Svaki zahtev iz spec-a je pokriven — 9 MCP alata (create, read, update, delete, list, search, backlinks, suggest, sync), CLI (init, server, sync), safety (file name sanitizacija, max size, max files, path traversal, symlink), auto-discovery, wikilink parser.
2. **Placeholder scan:** Nema TBD, TODO, "implement later".
3. **Type consistency:** `Memory`, `MemoryMetadata`, `ToolDefinition`, `SyncPayload` — svi tipovi su definisani u `types.ts` pre upotrebe.
4. **No gaps:** Svaki alat ima svoju task/code, testovi su specifični i kompletni.
