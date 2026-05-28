import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { checkSymlink, assertFileSize } from './safety.js';

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
  const index: Record<string, Set<string>> = {};
  const entries = await readdir(memoryDir, { withFileTypes: true });
  const files = entries.filter((f) => f.isFile() && f.name.endsWith('.md')).map((f) => f.name);

  const contents = await Promise.all(
    files.map(async (file) => {
      const fp = join(memoryDir, file);
      try {
        await checkSymlink(fp);
        await assertFileSize(fp);
      } catch {
        return null;
      }
      return {
        file,
        content: await readFile(fp, 'utf-8'),
      };
    })
  );

  for (const item of contents) {
    if (!item) continue;
    const { file, content } = item;
    const fromTitle = file.replace('.md', '');
    const linkedTo = extractLinks(content);

    for (const target of linkedTo) {
      if (!index[target]) index[target] = new Set();
      index[target].add(fromTitle);
    }
  }

  const result: BacklinkIndex = {};
  for (const [target, sources] of Object.entries(index)) {
    result[target] = Array.from(sources);
  }
  return result;
}

export function countLinks(content: string): number {
  return extractLinks(content).length;
}
