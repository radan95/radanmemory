export interface MemoryMetadata {
  title: string;
  tags: string[];
  links: string[];
  backlinks: string[];
  size: number;
  created: string;
  updated: string;
}

export interface Memory extends MemoryMetadata {
  content: string;
}

export interface SyncMemory {
  title: string;
  content: string;
  tags: string[];
  links: string[];
  checksum: string;
  updated: string;
}

export interface SyncPayload {
  memories: SyncMemory[];
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: string[];
}