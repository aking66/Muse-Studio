'use server';

import { randomUUID } from 'crypto';
import { db } from '@/db';
import type { McpToolCallLogEntry } from '@/lib/mcp-extensions/mcpChatTypes';

export type McpExtensionsInitialLine =
  | { id: string; role: 'user'; content: string }
  | {
      id: string;
      role: 'assistant';
      content: string;
      toolCalls?: McpToolCallLogEntry[];
    };

type Row = {
  id: string;
  role: string;
  content: string;
  tool_calls_json: string | null;
};

export async function getMcpExtensionsChatInitialLines(): Promise<McpExtensionsInitialLine[]> {
  const rows = db
    .prepare(
      `SELECT id, role, content, tool_calls_json FROM mcp_extensions_chat_messages ORDER BY sort_key ASC`,
    )
    .all() as Row[];

  const out: McpExtensionsInitialLine[] = [];
  for (const r of rows) {
    if (r.role === 'user') {
      out.push({ id: r.id, role: 'user', content: r.content });
      continue;
    }
    if (r.role === 'assistant') {
      let toolCalls: McpToolCallLogEntry[] | undefined;
      if (r.tool_calls_json && r.tool_calls_json.trim()) {
        try {
          const parsed = JSON.parse(r.tool_calls_json) as unknown;
          if (Array.isArray(parsed)) toolCalls = parsed as McpToolCallLogEntry[];
        } catch {
          toolCalls = undefined;
        }
      }
      out.push({
        id: r.id,
        role: 'assistant',
        content: r.content,
        toolCalls,
      });
    }
  }
  return out;
}

export async function appendMcpExtensionsChatTurn(input: {
  userContent: string;
  assistantContent: string;
  toolCalls: McpToolCallLogEntry[];
}): Promise<void> {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO mcp_extensions_chat_messages (id, role, content, tool_calls_json, created_at)
     VALUES (@id, @role, @content, @tool_calls_json, @created_at)`,
  );
  const run = db.transaction(() => {
    insert.run({
      id: randomUUID(),
      role: 'user',
      content: input.userContent,
      tool_calls_json: null,
      created_at: now,
    });
    insert.run({
      id: randomUUID(),
      role: 'assistant',
      content: input.assistantContent,
      tool_calls_json:
        input.toolCalls.length > 0 ? JSON.stringify(input.toolCalls) : null,
      created_at: now,
    });
  });
  run();
}
