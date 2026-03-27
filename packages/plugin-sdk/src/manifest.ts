import { z } from 'zod';

// Host->plugin contract versioning.
// Use an integer-like string (e.g. "1") to keep compatibility checks simple.
export const MuseApiVersionSchema = z.string().regex(/^\d+(\.\d+)?$/);

export const PluginHookSchema = z.object({
  // Example: "image.generate"
  capability: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
  // API path served by the plugin service. Resolved against service.baseUrl.
  // If left as the default placeholder, the host will derive the path from `capability`.
  path: z.string().min(1).default('/hooks/capability'),
  // Optional: hints for Muse UI/tooling. Not required for MVP.
  description: z.string().optional(),
});

export const UIExtensionSchema = z.object({
  // Example: "settings.tab", "scene.actions"
  slot: z.string().min(1),
  // The plugin-hosted URL. The host loads it in an iframe sandbox.
  bundleUrl: z.string().min(1),
  // Optional integrity hash for later hardening (MVP does not verify).
  integrityHash: z.string().optional(),
  // Optional: the plugin can declare which capabilities/settings it needs for this UI.
  permissions: z.array(z.string()).optional(),
});

export const PluginServiceSchema = z.object({
  // Where Muse should call into the plugin runtime.
  baseUrl: z.string().url(),
  // Health check endpoint. Defaults to "/health".
  healthPath: z.string().min(1).default('/health'),
  // MVP supports only "none" and "bearer" style tokens.
  authScheme: z.enum(['none', 'bearer']).default('none'),
  // Optional: list of env vars the plugin expects (for installer UX).
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

  // Which Muse capabilities the plugin can serve.
  hooks: z.array(PluginHookSchema).default([]),

  // Optional UI extension points.
  uiExtensions: z.array(UIExtensionSchema).default([]),

  // Least-privilege scopes Muse will request/track for the plugin.
  // Examples: "project:read", "scene:write", "media:generate"
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
 * - Host is assumed compatible with all higher/minor plugin versions.
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
  // Simple numeric major/minor comparison without semver dependency.
  // This is intentionally conservative; Phase 3 can switch to full semver.
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

