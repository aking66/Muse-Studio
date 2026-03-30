import {
  callEnabledPluginsForCapability,
  listMcpExtensionToolsForLlm,
  type McpExtensionToolDescriptor,
} from '@/lib/actions/plugins';
import {
  runPluginImageGeneration,
  runPluginVideoGeneration,
} from '@/lib/plugin-extension/provider-adapter';
import type {
  MuseImageGenerateInput,
  MuseVideoGenerateInput,
} from '@/lib/plugin-extension/provider-contracts';
import { extractImageGenParamsFromText } from '@/lib/mcp-extensions/extractImageGenParamsFromText';
import type { McpChatResponse, McpToolCallLogEntry, McpToolCallPreview } from '@/lib/mcp-extensions/mcpChatTypes';

const MCP_CONSOLE_OUTPUT_DIR = 'drafts/mcp-extensions/global';

export function resolveToolTarget(
  catalog: McpExtensionToolDescriptor[],
  capability: string,
  pluginId?: string,
): McpExtensionToolDescriptor | null {
  const matches = catalog.filter((t) => t.capability === capability);
  if (matches.length === 0) return null;
  if (pluginId) {
    const exact = matches.find((t) => t.pluginId === pluginId);
    if (exact) return exact;
  }
  return matches[0] ?? null;
}

function extractJsonPreviews(data: unknown): McpToolCallPreview[] {
  if (data === null || data === undefined) return [];
  if (typeof data === 'string') {
    return [{ kind: 'json', label: data.length > 400 ? `${data.slice(0, 400)}…` : data }];
  }
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    const out: McpToolCallPreview[] = [];
    const fi = o.finalImage as { url?: string } | undefined;
    const fv = o.finalVideo as { url?: string } | undefined;
    if (fi?.url) out.push({ kind: 'image', url: String(fi.url) });
    if (fv?.url) out.push({ kind: 'video', url: String(fv.url) });
    if (out.length > 0) return out;
  }
  try {
    const s = JSON.stringify(data, null, 2);
    return [{ kind: 'json', label: s.length > 1200 ? `${s.slice(0, 1200)}…` : s }];
  } catch {
    return [{ kind: 'json', label: String(data) }];
  }
}

function toPreviewUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('/api/outputs/')) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const trimmed = pathOrUrl.replace(/^\/+/, '');
  return `/api/outputs/${trimmed}`;
}

/**
 * Run a single MCP / extension tool (used by the Extensions chat after LLM planning, approval, or quick-run).
 */
export async function executeMcpToolPlan(params: {
  capability: string;
  pluginId: string;
  input?: unknown;
  /** For image.generate, merged with structured fields from this message when present. */
  latestUserMessage?: string;
}): Promise<McpChatResponse> {
  const { capability, pluginId, input, latestUserMessage } = params;
  const catalog = await listMcpExtensionToolsForLlm();
  const target = resolveToolTarget(catalog, capability, pluginId);
  const toolCalls: McpToolCallLogEntry[] = [];

  if (!target) {
    toolCalls.push({
      capability,
      pluginId,
      status: 'error',
      error: `No enabled extension provides capability "${capability}".`,
      previews: [],
    });
    return {
      assistantText: `No matching enabled tool for "${capability}".`,
      toolCalls,
    };
  }

  let assistantText = '';

  try {
    if (capability === 'image.generate') {
      const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
      const fromUserText = latestUserMessage ? extractImageGenParamsFromText(latestUserMessage) : {};
      const merged: Record<string, unknown> = {
        ...fromUserText,
        ...raw,
      };
      if (typeof merged.prompt !== 'string' || !merged.prompt.trim()) {
        throw new Error('Tool input must include a string "prompt" for image.generate.');
      }
      const inp = merged as unknown as MuseImageGenerateInput;
      const out = await runPluginImageGeneration({
        pluginId: target.pluginId,
        input: inp,
        targetRelDir: MCP_CONSOLE_OUTPUT_DIR,
      });
      const previewUrl = toPreviewUrl(`/api/outputs/${out.outputRelPath}`);
      toolCalls.push({
        capability,
        pluginId: out.pluginId ?? target.pluginId,
        pluginName: target.pluginName,
        status: 'ok',
        previews: [{ kind: 'image', url: previewUrl, label: out.response.finalImage?.alt ?? 'Image output' }],
      });
      assistantText = `Generated image via **${target.pluginName}** (\`${capability}\`). Output is shown below.`;
      return { assistantText, toolCalls };
    }

    if (capability === 'video.generate') {
      const inp = (input && typeof input === 'object' ? input : {}) as MuseVideoGenerateInput;
      const out = await runPluginVideoGeneration({
        pluginId: target.pluginId,
        input: inp,
        targetRelDir: MCP_CONSOLE_OUTPUT_DIR,
      });
      const previewUrl = toPreviewUrl(`/api/outputs/${out.outputRelPath}`);
      toolCalls.push({
        capability,
        pluginId: out.pluginId ?? target.pluginId,
        pluginName: target.pluginName,
        status: 'ok',
        previews: [{ kind: 'video', url: previewUrl, label: 'Video output' }],
      });
      assistantText = `Generated video via **${target.pluginName}** (\`${capability}\`). Output is shown below.`;
      return { assistantText, toolCalls };
    }

    const call = await callEnabledPluginsForCapability({
      capability,
      pluginId: target.pluginId,
      input: input ?? {},
    });

    if (!call.ok) {
      toolCalls.push({
        capability,
        pluginId: target.pluginId,
        pluginName: target.pluginName,
        status: 'error',
        error: call.error ?? 'Unknown error',
        previews: [],
      });
      return {
        assistantText: `Extension call failed: ${call.error ?? 'unknown error'}`,
        toolCalls,
      };
    }

    const previews = extractJsonPreviews(call.data).map((p) =>
      p.kind === 'image' && p.url
        ? { ...p, url: toPreviewUrl(p.url) }
        : p.kind === 'video' && p.url
          ? { ...p, url: toPreviewUrl(p.url) }
          : p,
    );

    toolCalls.push({
      capability,
      pluginId: call.pluginId ?? target.pluginId,
      pluginName: target.pluginName,
      status: 'ok',
      previews,
    });
    assistantText = `Executed **${target.pluginName}** — \`${capability}\`. Result below.`;
    return { assistantText, toolCalls };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toolCalls.push({
      capability,
      pluginId: target.pluginId,
      pluginName: target.pluginName,
      status: 'error',
      error: msg,
      previews: [],
    });
    return {
      assistantText: `Error: ${msg}`,
      toolCalls,
    };
  }
}
