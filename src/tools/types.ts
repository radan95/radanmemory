import type { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
  handler: (params: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
}
