/**
 * Muse plugin / MCP bridge manifest schema (Zod).
 * Previously imported from `@muse/plugin-sdk`; inlined after package removal.
 */
import { z } from 'zod';

const httpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const pluginHookSchema = z.object({
  capability: z.string().min(1),
  method: z.union([httpMethodSchema, z.literal('MCP')]),
  path: z.string().min(1),
  description: z.string().optional(),
});

export const uiExtensionSchema = z.object({
  slot: z.string().min(1),
  bundleUrl: z.string().url(),
  integrityHash: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

export const pluginServiceSchema = z.object({
  baseUrl: z.string().url().optional(),
  healthPath: z.string().optional(),
  authScheme: z.enum(['none', 'bearer', 'header']).optional(),
  requiredEnv: z.array(z.string()).optional(),
});

export const pluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  museApiVersion: z.string().min(1),
  minMuseVersion: z.string().optional(),
  maxMuseVersion: z.string().optional(),
  providerId: z.string().optional(),
  service: pluginServiceSchema,
  hooks: z.array(pluginHookSchema).default([]),
  uiExtensions: z.array(uiExtensionSchema).default([]),
  permissions: z.array(z.string()).optional(),
  /** When set, this entry was registered from an MCP Streamable HTTP server (`POST …/mcp`). */
  mcp: z
    .object({
      endpointUrl: z.string().url(),
    })
    .optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type PluginHook = z.infer<typeof pluginHookSchema>;
export type UIExtension = z.infer<typeof uiExtensionSchema>;
export type PluginService = z.infer<typeof pluginServiceSchema>;

export function parsePluginManifest(raw: unknown): PluginManifest {
  return pluginManifestSchema.parse(raw);
}

function parseSemverMajor(v: string): number | null {
  const m = /^(\d+)/.exec(v.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function isMuseApiCompatible(pluginApiVersion: string, hostApiVersion: string): boolean {
  const a = parseSemverMajor(pluginApiVersion);
  const b = parseSemverMajor(hostApiVersion);
  if (a == null || b == null) return false;
  return a === b;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

export function isWithinMuseVersionRange(params: {
  pluginMinMuseVersion?: string;
  pluginMaxMuseVersion?: string;
  hostMuseVersion: string;
}): boolean {
  const { pluginMinMuseVersion, pluginMaxMuseVersion, hostMuseVersion } = params;
  if (pluginMinMuseVersion && compareSemver(hostMuseVersion, pluginMinMuseVersion) < 0) {
    return false;
  }
  if (pluginMaxMuseVersion && compareSemver(hostMuseVersion, pluginMaxMuseVersion) > 0) {
    return false;
  }
  return true;
}
