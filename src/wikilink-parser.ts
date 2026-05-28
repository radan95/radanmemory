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
  const index: Record<string, Set<string>> = {};
  const files = (await readdir(memoryDir)).filter((f) => f.endsWith('.md'));

  const contents = await Promise.all(
    files.map(async (file) => ({
      file,
      content: await readFile(join(memoryDir, file), 'utf-8'),
    }))
  );

  for (const { file, content } of contents) {
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
