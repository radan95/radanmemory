import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { extractLinks } from './wikilink-parser.js';
import { checkSymlink, assertFileSize } from './safety.js';
import type { Memory } from './types.js';

export interface ConnectionSuggestion {
  title: string;
  reason: string;
  score: number;
}

export async function suggestConnections(memoryDir: string, target: Memory): Promise<ConnectionSuggestion[]> {
  const entries = await readdir(memoryDir, { withFileTypes: true });
  const mdFiles = entries
    .filter((f) => f.isFile() && f.name.endsWith('.md') && !f.name.startsWith('_') && f.name.replace('.md', '') !== target.title)
    .map((f) => f.name);
  const suggestions: ConnectionSuggestion[] = [];

  for (const file of mdFiles) {
    const title = file.replace('.md', '');
    const fp = join(memoryDir, file);

    try {
      await checkSymlink(fp);
      await assertFileSize(fp);
    } catch {
      continue;
    }

    let raw: string;
    try {
      raw = await readFile(fp, 'utf-8');
    } catch (err) {
      if (err instanceof Error && err.message.includes('ENOENT')) {
        continue;
      }
      throw err;
    }
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
