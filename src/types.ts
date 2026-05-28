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

export interface SyncPayload {
  memories: Array<{
    title: string;
    content: string;
    tags: string[];
    checksum: string;
    updated: string;
  }>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: string[];
}