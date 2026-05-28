import { createHash } from 'node:crypto';

export function computeChecksum(raw: string): string {
  let content = raw;
  if (raw.startsWith('---')) {
    const endIdx = raw.indexOf('---', 3);
    if (endIdx !== -1) {
      content = raw.slice(endIdx + 3).trimStart();
    }
  }
  const hash = createHash('sha256').update(content, 'utf-8').digest('hex');
  return `sha256:${hash}`;
}
