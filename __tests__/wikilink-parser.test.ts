import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { extractLinks, extractLinksWithContext, countLinks, buildBacklinkIndex } from '../src/wikilink-parser.js';

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

    it('does not dedupe duplicate links in same content', () => {
      const text = '[[a]] and [[a]]';
      expect(extractLinks(text)).toEqual(['a', 'a']);
    });

    it('ignores empty brackets', () => {
      const text = '[[]]';
      expect(extractLinks(text)).toEqual([]);
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

    it('handles wikilink on first line', () => {
      const text = '[[first]] line.\nSecond line.';
      const results = extractLinksWithContext(text);
      expect(results).toHaveLength(1);
      expect(results[0].target).toBe('first');
    });

    it('handles multiple wikilinks on same line', () => {
      const text = 'See [[a]] and [[b]] here.';
      const results = extractLinksWithContext(text);
      expect(results).toHaveLength(2);
      expect(results[0].target).toBe('a');
      expect(results[1].target).toBe('b');
    });
  });

  describe('countLinks', () => {
    it('counts wikilinks in content', () => {
      expect(countLinks('[[a]] i [[b]]')).toBe(2);
    });
  });

  describe('buildBacklinkIndex', () => {
    let memDir: string;

    beforeEach(async () => {
      memDir = join(tmpdir(), `radanmemory-${randomUUID()}`);
      await mkdir(memDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(memDir, { recursive: true, force: true });
    });

    it('builds reverse index from multiple files', async () => {
      await writeFile(join(memDir, 'auth.md'), 'We use [[supabase-auth]].');
      await writeFile(join(memDir, 'setup.md'), 'Configure [[supabase-auth]] first.');
      await writeFile(join(memDir, 'other.md'), 'No links here.');

      const index = await buildBacklinkIndex(memDir);
      expect(index['supabase-auth']).toContain('auth');
      expect(index['supabase-auth']).toContain('setup');
      expect(index['supabase-auth']).toHaveLength(2);
    });

    it('deduplicates multiple links from same file', async () => {
      await writeFile(join(memDir, 'auth.md'), 'See [[supabase-auth]] and [[supabase-auth]] again.');

      const index = await buildBacklinkIndex(memDir);
      expect(index['supabase-auth']).toEqual(['auth']);
    });

    it('skips non-md files', async () => {
      await writeFile(join(memDir, 'auth.md'), 'Link to [[other]].');
      await writeFile(join(memDir, 'readme.txt'), 'Link to [[other]] in text.');

      const index = await buildBacklinkIndex(memDir);
      expect(index['other']).toEqual(['auth']);
    });

    it('returns empty index for empty directory', async () => {
      const index = await buildBacklinkIndex(memDir);
      expect(Object.keys(index)).toHaveLength(0);
    });
  });
});
