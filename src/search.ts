import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkSymlink, assertFileSize } from './safety.js';

export interface SearchResult {
  title: string;
  snippet: string;
  score: number;
}

export async function searchMemories(dir: string, query: string): Promise<SearchResult[]> {
  if (!query || query.trim().length === 0) {
    throw new Error('Query cannot be empty');
  }

  const files = await readdir(dir, { withFileTypes: true });
  const mdFiles = files.filter((f) => f.isFile() && f.name.endsWith('.md') && !f.name.startsWith('_'));
  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const file of mdFiles) {
    const title = file.name.replace('.md', '');
    const fp = join(dir, file.name);

    try {
      await checkSymlink(fp);
      await assertFileSize(fp);
    } catch {
      continue;
    }

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
