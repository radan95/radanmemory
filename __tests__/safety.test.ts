import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  sanitizeTitle,
  toFilename,
  assertNoPathTraversal,
  assertContentSize,
  assertFileSize,
  assertFileCount,
  checkSymlink,
} from '../src/safety.js';

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

    it('throws on invalid input', () => {
      expect(() => toFilename('../etc/passwd')).toThrow();
    });
  });

  describe('assertNoPathTraversal', () => {
    it('throws on ../ in path', () => {
      expect(() => assertNoPathTraversal('../../foo')).toThrow();
    });

    it('throws on absolute path', () => {
      expect(() => assertNoPathTraversal('/etc/passwd')).toThrow();
    });

    it('allows valid relative path', () => {
      expect(() => assertNoPathTraversal('foo/bar')).not.toThrow();
    });
  });

  describe('assertContentSize', () => {
    it('throws on content over 1MB', () => {
      const big = 'x'.repeat(1_000_001);
      expect(() => assertContentSize(big)).toThrow();
    });

    it('allows content exactly at 1MB', () => {
      const exact = 'x'.repeat(1_000_000);
      expect(() => assertContentSize(exact)).not.toThrow();
    });

    it('allows normal content', () => {
      expect(() => assertContentSize('hello')).not.toThrow();
    });

    it('respects byte length for unicode', () => {
      const unicode = '🎉'.repeat(500_000); // each emoji is 4 bytes
      expect(() => assertContentSize(unicode)).toThrow();
    });
  });

  describe('assertFileSize', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `radanmemory-test-${randomUUID()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('throws on file over 1MB', async () => {
      const fp = join(testDir, 'big.md');
      await writeFile(fp, 'x'.repeat(1_000_001));
      await expect(assertFileSize(fp)).rejects.toThrow('exceeds max size');
    });

    it('allows normal file', async () => {
      const fp = join(testDir, 'small.md');
      await writeFile(fp, 'hello');
      await expect(assertFileSize(fp)).resolves.toBeUndefined();
    });
  });

  describe('assertFileCount', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `radanmemory-test-${randomUUID()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('throws when exceeding max files', async () => {
      // Create files up to limit
      for (let i = 0; i <= 10_000; i++) {
        await writeFile(join(testDir, `file-${i}.md`), 'content');
      }
      await expect(assertFileCount(testDir)).rejects.toThrow('Max 10000 memories allowed');
    });

    it('allows count at or below limit', async () => {
      for (let i = 0; i < 10_000; i++) {
        await writeFile(join(testDir, `file-${i}.md`), 'content');
      }
      await expect(assertFileCount(testDir)).resolves.toBeUndefined();
    });

    it('ignores directories ending in .md', async () => {
      await mkdir(join(testDir, 'fake.md'), { recursive: true });
      await expect(assertFileCount(testDir)).resolves.toBeUndefined();
    });
  });

  describe('checkSymlink', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `radanmemory-test-${randomUUID()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('throws on symlink', async () => {
      const target = join(testDir, 'real.md');
      const link = join(testDir, 'link.md');
      await writeFile(target, 'content');
      await symlink(target, link);
      await expect(checkSymlink(link)).rejects.toThrow('Symlinks not allowed');
    });

    it('allows regular file', async () => {
      const fp = join(testDir, 'real.md');
      await writeFile(fp, 'content');
      await expect(checkSymlink(fp)).resolves.toBeUndefined();
    });

    it('throws ENOENT for missing file', async () => {
      const fp = join(testDir, 'missing.md');
      await expect(checkSymlink(fp)).rejects.toThrow();
    });
  });
});
