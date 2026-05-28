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
