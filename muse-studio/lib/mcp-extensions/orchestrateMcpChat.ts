import { getLLMSettings } from '@/lib/actions/settings';
import {
  listMcpExtensionToolsForLlm,
  type McpExtensionToolDescriptor,
  getMcpHookMcpPolicy,
} from '@/lib/actions/plugins';
import { completeJsonOrchestration } from '@/lib/mcp-extensions/llmJsonCompletion';
import { executeMcpToolPlan, resolveToolTarget } from '@/lib/mcp-extensions/executeMcpToolPlan';
import type {
  McpChatMessage,
  McpChatResponse,
  McpToolCallLogEntry,
  McpToolCallPreview,
} from '@/lib/mcp-extensions/mcpChatTypes';

export type {
  McpChatMessage,
  McpToolCallPreview,
  McpToolCallLogEntry,
  McpChatResponse,
  McpPendingApproval,
} from '@/lib/mcp-extensions/mcpChatTypes';

type OrchestratorPlan = {
  reply?: string;
  tool?: {
    capability: string;
    pluginId?: string;
    input?: unknown;
  } | null;
};

export async function orchestrateMcpExtensionsChat(params: {
  messages: McpChatMessage[];
}): Promise<McpChatResponse> {
  const { messages } = params;
  if (messages.length === 0) {
    return { assistantText: 'Send a message to start.', toolCalls: [] };
  }

  const lastUserIdx = [...messages].map((m, i) => (m.role === 'user' ? i : -1)).filter((i) => i >= 0).pop();
  if (lastUserIdx === undefined) {
    return { assistantText: 'No user message found.', toolCalls: [] };
  }

  const latestUser = messages[lastUserIdx]!.content;
  const history = messages.slice(0, lastUserIdx);

  const [settings, catalog] = await Promise.all([getLLMSettings(), listMcpExtensionToolsForLlm()]);
  const catalogJson = JSON.stringify(catalog, null, 2);

  const rawJson = await completeJsonOrchestration({
    settings,
    catalogJson,
    history,
    latestUserMessage: latestUser,
  });

  let plan: OrchestratorPlan;
  try {
    plan = JSON.parse(rawJson) as OrchestratorPlan;
  } catch {
    return {
      assistantText: `The model did not return valid JSON. Raw response:\n\n${rawJson.slice(0, 2000)}`,
      toolCalls: [],
    };
  }

  let assistantText = typeof plan.reply === 'string' ? plan.reply : '';

  if (!plan.tool || plan.tool === null) {
    return {
      assistantText: assistantText || 'No action taken.',
      toolCalls: [],
    };
  }

  const { capability, pluginId: requestedPluginId, input } = plan.tool;
  if (!capability || typeof capability !== 'string') {
    return { assistantText: assistantText || 'Invalid tool plan (missing capability).', toolCalls: [] };
  }

  const target = resolveToolTarget(catalog, capability, requestedPluginId);
  if (!target) {
    const toolCalls: McpToolCallLogEntry[] = [
      {
        capability,
        pluginId: requestedPluginId,
        status: 'error',
        error: `No enabled extension provides capability "${capability}".`,
        previews: [],
      },
    ];
    return {
      assistantText:
        assistantText ||
        `I could not run "${capability}" — no matching extension is installed and enabled.`,
      toolCalls,
    };
  }

  const policy = await getMcpHookMcpPolicy(target.pluginId, capability);
  if (policy === 'ask') {
    return {
      assistantText:
        assistantText ||
        `**${target.pluginName}** · \`${capability}\` is set to **Ask** — confirm below to run it on the server.`,
      toolCalls: [],
      pendingApproval: {
        capability,
        pluginId: target.pluginId,
        pluginName: target.pluginName,
        input: input ?? {},
      },
    };
  }

  return executeMcpToolPlan({
    capability,
    pluginId: target.pluginId,
    input,
    latestUserMessage: latestUser,
  });
}
