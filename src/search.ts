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
