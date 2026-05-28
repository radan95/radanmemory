import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  timestamp: string;
  data: T;
}

export class CloudCache {
  private dir: string;

  constructor(memoryDir: string) {
    this.dir = join(memoryDir, '.cache');
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private async readCache<T>(filename: string): Promise<T | null> {
    try {
      const raw = await readFile(join(this.dir, filename), 'utf-8');
      const entry = JSON.parse(raw) as CacheEntry<T>;
      const age = Date.now() - new Date(entry.timestamp).getTime();
      if (age > CACHE_TTL_MS) return null;
      return entry.data;
    } catch {
      return null;
    }
  }

  private async writeCache<T>(filename: string, data: T): Promise<void> {
    await this.ensureDir();
    const entry: CacheEntry<T> = { timestamp: new Date().toISOString(), data };
    await writeFile(join(this.dir, filename), JSON.stringify(entry), 'utf-8');
  }

  async getProjects(): Promise<unknown[] | null> {
    return this.readCache<unknown[]>('projects.json');
  }

  async setProjects(projects: unknown[]): Promise<void> {
    await this.writeCache('projects.json', projects);
  }

  async getTasks(projectId?: string): Promise<unknown[] | null> {
    const filename = projectId ? `tasks-${projectId}.json` : 'tasks-all.json';
    return this.readCache<unknown[]>(filename);
  }

  async setTasks(tasks: unknown[], projectId?: string): Promise<void> {
    const filename = projectId ? `tasks-${projectId}.json` : 'tasks-all.json';
    await this.writeCache(filename, tasks);
  }

  async getAgents(projectId?: string): Promise<unknown[] | null> {
    const filename = projectId ? `agents-${projectId}.json` : 'agents-all.json';
    return this.readCache<unknown[]>(filename);
  }

  async setAgents(agents: unknown[], projectId?: string): Promise<void> {
    const filename = projectId ? `agents-${projectId}.json` : 'agents-all.json';
    await this.writeCache(filename, agents);
  }

  async invalidate(): Promise<void> {
    try {
      const files = await readdir(this.dir);
      await Promise.all(files.map(f => rm(join(this.dir, f))));
    } catch {
      // Dir doesn't exist, ok
    }
  }
}
