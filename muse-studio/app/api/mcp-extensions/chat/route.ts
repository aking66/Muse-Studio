import { NextRequest, NextResponse } from 'next/server';
import { appendMcpExtensionsChatTurn } from '@/lib/actions/mcpExtensionsChat';
import { listMcpExtensionToolsForLlm } from '@/lib/actions/plugins';
import { executeMcpToolPlan, resolveToolTarget } from '@/lib/mcp-extensions/executeMcpToolPlan';
import { orchestrateMcpExtensionsChat } from '@/lib/mcp-extensions/orchestrateMcpChat';
import type { McpChatMessage } from '@/lib/mcp-extensions/mcpChatTypes';

export const dynamic = 'force-dynamic';

/** Allow long-running MCP tool calls (e.g. local diffusion) without route timeout. */
export const maxDuration = 800;

function parseMessages(raw: unknown): McpChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages: McpChatMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as { role?: string }).role;
    const content = (m as { content?: string }).content;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string') continue;
    messages.push({ role, content });
  }
  return messages;
}

function findLastUser(messages: McpChatMessage[]): McpChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') return messages[i];
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  let lastUser: McpChatMessage | undefined;
  try {
    const body = (await req.json()) as {
      messages?: unknown;
      executeTool?: {
        capability: string;
        pluginId?: string;
        input?: unknown;
        note?: string;
      };
      approvePending?: {
        capability: string;
        pluginId: string;
        input?: unknown;
      };
    };

    if (body.executeTool && typeof body.executeTool.capability === 'string') {
      const catalog = await listMcpExtensionToolsForLlm();
      const resolved = resolveToolTarget(
        catalog,
        body.executeTool.capability,
        body.executeTool.pluginId,
      );
      if (!resolved) {
        return NextResponse.json(
          { error: `No enabled tool for capability "${body.executeTool.capability}".`, assistantText: '', toolCalls: [] },
          { status: 400 },
        );
      }
      const result = await executeMcpToolPlan({
        capability: body.executeTool.capability,
        pluginId: resolved.pluginId,
        input: body.executeTool.input,
        latestUserMessage: typeof body.executeTool.note === 'string' ? body.executeTool.note : undefined,
      });
      const note = body.executeTool.note?.trim();
      const userLine =
        note && note.length > 0
          ? note
          : `Run MCP tool: ${body.executeTool.capability}`;
      try {
        await appendMcpExtensionsChatTurn({
          userContent: userLine,
          assistantContent: result.assistantText ?? '',
          toolCalls: result.toolCalls ?? [],
        });
      } catch {
        /* ignore persistence errors */
      }
      return NextResponse.json(result);
    }

    if (body.approvePending && typeof body.approvePending.capability === 'string' && body.approvePending.pluginId) {
      const messages = parseMessages(body.messages);
      lastUser = findLastUser(messages);
      const result = await executeMcpToolPlan({
        capability: body.approvePending.capability,
        pluginId: body.approvePending.pluginId,
        input: body.approvePending.input,
        latestUserMessage: undefined,
      });
      try {
        await appendMcpExtensionsChatTurn({
          userContent: lastUser?.content ?? 'Confirmed MCP tool execution',
          assistantContent: result.assistantText ?? '',
          toolCalls: result.toolCalls ?? [],
        });
      } catch {
        /* ignore */
      }
      return NextResponse.json(result);
    }

    const raw = body.messages;
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: 'Request body must include a "messages" array (or executeTool / approvePending).' },
        { status: 400 },
      );
    }

    const messages = parseMessages(raw);
    lastUser = findLastUser(messages);

    const result = await orchestrateMcpExtensionsChat({ messages });

    if (lastUser) {
      try {
        await appendMcpExtensionsChatTurn({
          userContent: lastUser.content,
          assistantContent: result.assistantText ?? '',
          toolCalls: result.toolCalls ?? [],
        });
      } catch {
        /* persistence failure should not drop the chat response */
      }
    }

    return NextResponse.json(result);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (lastUser) {
      try {
        await appendMcpExtensionsChatTurn({
          userContent: lastUser.content,
          assistantContent: `**Error:** ${errMsg}`,
          toolCalls: [],
        });
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json(
      { error: errMsg, assistantText: '', toolCalls: [] },
      { status: 500 },
    );
  }
}
