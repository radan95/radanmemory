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
