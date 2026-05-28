import { readdir, stat, lstat } from 'node:fs/promises';
import { join } from 'node:path';

const VALID_TITLE_RE = /^[a-z0-9-_]+$/i;
const MAX_FILE_SIZE = 1_000_000; // 1MB
const MAX_FILES = 10_000;

export function sanitizeTitle(title: string): string {
  const clean = title.replace(/\.md$/i, '').trim();
  if (!VALID_TITLE_RE.test(clean)) {
    throw new Error(`Invalid title: "${title}" — only [a-z0-9-_] allowed`);
  }
  return clean;
}

export function toFilename(title: string): string {
  return `${sanitizeTitle(title)}.md`;
}

export function assertNoPathTraversal(input: string): void {
  if (input.includes('..') || input.startsWith('/')) {
    throw new Error(`Path traversal detected in: "${input}"`);
  }
}

export async function assertFileSize(filepath: string): Promise<void> {
  const { size } = await stat(filepath);
  if (size > MAX_FILE_SIZE) {
    throw new Error(`File exceeds max size (1MB): ${filepath}`);
  }
}

export async function assertFileCount(dir: string): Promise<void> {
  const entries = await readdir(dir);
  const mdFiles = entries.filter((e) => e.endsWith('.md'));
  if (mdFiles.length >= MAX_FILES) {
    throw new Error(`Max ${MAX_FILES} memories allowed`);
  }
}

export async function checkSymlink(filepath: string): Promise<void> {
  const real = await lstat(filepath);
  if (real.isSymbolicLink()) {
    throw new Error(`Symlinks not allowed: ${filepath}`);
  }
}

export function assertContentSize(content: string): void {
  const bytes = Buffer.byteLength(content, 'utf-8');
  if (bytes > MAX_FILE_SIZE) {
    throw new Error('Content exceeds max size (1MB)');
  }
}
