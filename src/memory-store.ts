import { readFile, writeFile, readdir, mkdir, rename, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sanitizeTitle, toFilename, assertContentSize, assertFileSize, assertFileCount, checkSymlink } from './safety.js';
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

  private sanitizeTags(tags: string[]): string[] {
    return tags.map((t) => t.replace(/[\n\r\[\],]/g, '').trim()).filter(Boolean);
  }

  async create(title: string, content: string, tags: string[] = []): Promise<Memory> {
    const cleanTitle = sanitizeTitle(title);
    const fp = this.filePath(cleanTitle);

    assertContentSize(content);
    await assertFileCount(this.dir);

    if (existsSync(fp)) {
      throw new Error(`Memory "${cleanTitle}" already exists`);
    }

    const safeTags = this.sanitizeTags(tags);
    const now = new Date().toISOString();
    const frontmatter = `---\ntitle: ${cleanTitle}\ntags: [${safeTags.join(', ')}]\ncreated: ${now}\nupdated: ${now}\n---\n\n`;
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
    await assertFileSize(fp);

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

    const safeTags = this.sanitizeTags(tags);
    const fp = this.filePath(cleanTitle);
    const frontmatter = `---\ntitle: ${cleanTitle}\ntags: [${safeTags.join(', ')}]\ncreated: ${existing.created}\nupdated: ${now}\n---\n\n`;
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

    let dest = join(delDir, toFilename(cleanTitle));
    if (existsSync(dest)) {
      const timestamp = Date.now();
      dest = join(delDir, `${cleanTitle}-${timestamp}.md`);
    }
    await checkSymlink(fp);
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
        await checkSymlink(fp);
        await assertFileSize(fp);
        const raw = await readFile(fp, 'utf-8');
        const { metadata, content } = this.parseFile(raw, title);

        if (tag && !metadata.tags.includes(tag)) continue;

        result.push({
          ...metadata,
          title,
          links: extractLinks(content),
          backlinks: [],
          size: Buffer.byteLength(raw, 'utf-8'),
        });
      } catch (err) {
        if (err instanceof Error && (err.message.includes('not found') || err.message.includes('symlink'))) {
          continue;
        }
        throw err;
      }
    }

    result.sort((a, b) => b.updated.localeCompare(a.updated));
    return limit ? result.slice(0, limit) : result;
  }

  async exists(title: string): Promise<boolean> {
    return existsSync(this.filePath(sanitizeTitle(title)));
  }

  async checksum(title: string): Promise<string> {
    const fp = this.filePath(sanitizeTitle(title));
    await checkSymlink(fp);
    const raw = await readFile(fp, 'utf-8');
    return createHash('sha256').update(raw).digest('hex');
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
          const colonIdx = line.indexOf(':');
          if (colonIdx === -1) continue;
          const key = line.slice(0, colonIdx).trim();
          const val = line.slice(colonIdx + 1).trim();
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
