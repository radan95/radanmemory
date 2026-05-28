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
