import { join, resolve } from 'node:path';
import { access, mkdir, writeFile } from 'node:fs/promises';

const FOLDER_NAME = '.radanmemory';

export async function discoverMemoryDir(cwd?: string): Promise<string | null> {
  const start = cwd ?? process.cwd();
  let dir = resolve(start);

  while (true) {
    const candidate = join(dir, FOLDER_NAME);
    try {
      await access(candidate);
      return candidate;
    } catch {
      const parent = resolve(dir, '..');
      if (parent === dir) return null;
      dir = parent;
    }
  }
}

export async function discoverOrCreateMemoryDir(cwd?: string): Promise<string> {
  const found = await discoverMemoryDir(cwd);
  if (found) return found;

  const start = resolve(cwd ?? process.cwd());
  const path = join(start, FOLDER_NAME);
  await mkdir(path, { recursive: true });
  await ensureIndexFile(path);
  return path;
}

export async function ensureIndexFile(dir: string): Promise<void> {
  const indexPath = join(dir, '_index.md');
  try {
    await access(indexPath);
  } catch {
    await writeFile(
      indexPath,
      '# RadanMemory Index\n\nWelcome to your local knowledge graph.\n\n',
      'utf-8',
    );
  }
}
