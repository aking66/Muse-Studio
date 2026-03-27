import { z } from 'zod';

// Host->plugin contract versioning.
// Use an integer-like string (e.g. "1") to keep compatibility checks simple.
export const MuseApiVersionSchema = z.string().regex(/^\d+(\.\d+)?$/);

export const PluginHookSchema = z.object({
  // Example: "image.generate"
  capability: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
  // API path served by the plugin service.
  // If omitted in manifests, host derives it as `/hooks/<capability>`.
  path: z.string().min(1).default('/hooks/capability'),
  description: z.string().optional(),
});

export const UIExtensionSchema = z.object({
  slot: z.string().min(1),
  bundleUrl: z.string().min(1),
  integrityHash: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

export const PluginServiceSchema = z.object({
  baseUrl: z.string().url(),
  healthPath: z.string().min(1).default('/health'),
  authScheme: z.enum(['none', 'bearer']).default('none'),
  requiredEnv: z.array(z.string()).optional(),
});

export const PluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  author: z.string().optional(),
  description: z.string().optional(),
  homepage: z.string().url().optional(),

  museApiVersion: MuseApiVersionSchema,
  minMuseVersion: z.string().optional(),
  maxMuseVersion: z.string().optional(),

  service: PluginServiceSchema,
  hooks: z.array(PluginHookSchema).default([]),
  uiExtensions: z.array(UIExtensionSchema).default([]),

  // Least-privilege scopes Muse will request/track for the plugin.
  permissions: z.array(z.string()).default([]),
});

export type MuseApiVersion = z.infer<typeof MuseApiVersionSchema>;
export type PluginHook = z.infer<typeof PluginHookSchema>;
export type UIExtension = z.infer<typeof UIExtensionSchema>;
export type PluginService = z.infer<typeof PluginServiceSchema>;
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export function parsePluginManifest(json: unknown): PluginManifest {
  const parsed = PluginManifestSchema.parse(json);
  const derivedHooks = parsed.hooks.map((h) => {
    if (h.path === '/hooks/capability') {
      // MVP default: /hooks/<capability> where capability is URL-encoded.
      return { ...h, path: `/hooks/${encodeURIComponent(h.capability)}` };
    }
    return h;
  });
  return { ...parsed, hooks: derivedHooks };
}

function majorFromVersion(v: string): number {
  const m = v.match(/^(\d+)/);
  return m ? Number(m[1]) : NaN;
}

/**
 * MVP compatibility rules:
 * - Host and plugin must agree on the API "major" number.
 */
export function isMuseApiCompatible(pluginMuseApiVersion: string, hostMuseApiVersion: string): boolean {
  const p = majorFromVersion(pluginMuseApiVersion);
  const h = majorFromVersion(hostMuseApiVersion);
  if (Number.isNaN(p) || Number.isNaN(h)) return false;
  return p === h;
}

export function isWithinMuseVersionRange(params: {
  pluginMinMuseVersion?: string;
  pluginMaxMuseVersion?: string;
  hostMuseVersion: string;
}): boolean {
  // Intentionally conservative; Phase 3 can switch to full semver.
  const host = majorFromVersion(params.hostMuseVersion);
  if (Number.isNaN(host)) return true;

  if (params.pluginMinMuseVersion) {
    const min = majorFromVersion(params.pluginMinMuseVersion);
    if (!Number.isNaN(min) && host < min) return false;
  }
  if (params.pluginMaxMuseVersion) {
    const max = majorFromVersion(params.pluginMaxMuseVersion);
    if (!Number.isNaN(max) && host > max) return false;
  }
  return true;
}

