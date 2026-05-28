import { describe, it, expect } from 'vitest';
import { computeChecksum } from '../src/checksum.js';

describe('computeChecksum', () => {
  it('computes sha256 of content without frontmatter', () => {
    const raw = '---\ntitle: Test\n---\n\nHello world';
    const result = computeChecksum(raw);
    expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('returns same checksum for same content regardless of frontmatter changes', () => {
    const raw1 = '---\ntitle: A\ncreated: 2024-01-01\n---\n\nContent here';
    const raw2 = '---\ntitle: B\ncreated: 2025-01-01\n---\n\nContent here';
    expect(computeChecksum(raw1)).toBe(computeChecksum(raw2));
  });

  it('computes checksum for content without frontmatter', () => {
    const raw = 'Just plain content';
    const result = computeChecksum(raw);
    expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('produces different checksums for different content', () => {
    const raw1 = '---\n---\n\nContent A';
    const raw2 = '---\n---\n\nContent B';
    expect(computeChecksum(raw1)).not.toBe(computeChecksum(raw2));
  });
});
