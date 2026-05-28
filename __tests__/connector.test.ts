import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { suggestConnections } from '../src/connector.js';
import type { Memory } from '../src/types.js';

describe('connector', () => {
  let memDir: string;

  beforeEach(async () => {
    memDir = join(tmpdir(), `radanmemory-${randomUUID()}`);
    await mkdir(memDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(memDir, { recursive: true, force: true });
  });

  it('suggests by shared tags', async () => {
    await writeFile(
      join(memDir, 'auth.md'),
      '---\ntags: [auth, security]\n---\nAuth content.',
    );
    await writeFile(
      join(memDir, 'csrf.md'),
      '---\ntags: [auth, security]\n---\nCSRF content.',
    );

    const target: Memory = {
      title: 'auth',
      content: 'Auth content.',
      tags: ['auth', 'security'],
      links: [],
      backlinks: [],
      size: 100,
      created: '',
      updated: '',
    };

    const suggestions = await suggestConnections(memDir, target);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].title).toBe('csrf');
    expect(suggestions[0].reason).toContain('shared tags');
  });

  it('suggests by direct links', async () => {
    await writeFile(join(memDir, 'foo.md'), 'Sadrzi link ka [[bar]].');
    await writeFile(join(memDir, 'bar.md'), 'Sadrzaj.');

    const target: Memory = {
      title: 'foo',
      content: 'Sadrzi link ka [[bar]].',
      tags: [],
      links: ['bar'],
      backlinks: [],
      size: 50,
      created: '',
      updated: '',
    };

    const suggestions = await suggestConnections(memDir, target);
    expect(suggestions.some((s) => s.title === 'bar')).toBe(true);
  });

  it('excludes self from suggestions', async () => {
    await writeFile(join(memDir, 'self.md'), 'Sadrzaj.');

    const target: Memory = {
      title: 'self',
      content: 'Sadrzaj.',
      tags: ['tag1'],
      links: [],
      backlinks: [],
      size: 50,
      created: '',
      updated: '',
    };

    const suggestions = await suggestConnections(memDir, target);
    const selfSuggested = suggestions.some((s) => s.title === 'self');
    expect(selfSuggested).toBe(false);
  });
});
