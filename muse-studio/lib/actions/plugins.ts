'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import type { PluginHook, PluginManifest, PluginService, UIExtension } from '@/lib/plugin-extension/manifest';
import { isMuseApiCompatible, isWithinMuseVersionRange, parsePluginManifest } from '@/lib/plugin-extension/manifest';

import { HOST_MUSE_API_VERSION, HOST_MUSE_VERSION, type PluginSummary } from '@/lib/plugin-extension/plugin-types';

export interface PluginCapabilityProvider {
  id: string;
  name: string;
  version: string;
  capability: string;
  method: string;
  path: string;
}

interface PluginsRow {
  id: string;
  name: string;
  version: string;
  enabled: number;
  status: string;
  updated_at: string;
  manifest_json: string;
  source_url: string;
  repo: string | null;
  branch_or_tag: string | null;
  installed_at: string;
  last_error: string | null;
}

interface PluginEndpointRow {
  plugin_id: string;
  base_url: string;
  auth_type: string;
  auth_ref: string | null;
  health_status: string;
  last_health_at: string | null;
}

interface PluginHookRow {
  plugin_id: string;
  capability: string;
  method: string;
  path: string;
  permissions_json: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface PluginUiExtensionRow {
  plugin_id: string;
  slot: string;
  bundle_url: string;
  integrity_hash: string | null;
  permissions_json: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function pluginEnvBearerTokenKey(pluginId: string): string {
  const safe = pluginId.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  return `MUSE_PLUGIN_BEARER_TOKEN_${safe}`;
}

function resolveAuthRef(pluginId: string, authType: string, authRef: string | null): string | null {
  if (authRef) return authRef;
  if (authType === 'bearer') {
    return process.env[pluginEnvBearerTokenKey(pluginId)] ?? null;
  }
  return null;
}

function parseGitHubRepoUrl(githubUrl: string): {
  owner: string;
  repo: string;
  refCandidates: string[];
} {
  const url = githubUrl.trim().replace(/#.*$/, '');
  // Normalize: strip trailing slashes
  const normalized = url.replace(/\/+$/, '');

  // Common patterns:
  // - https://github.com/{owner}/{repo}
  // - https://github.com/{owner}/{repo}/tree/{ref}
  // - https://github.com/{owner}/{repo}/blob/{ref}
  const m = normalized.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\/(tree|blob)\/([^/]+))?$/i);
  if (!m) throw new Error('Unsupported GitHub URL. Please paste a GitHub repo URL.');

  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, '');
  const ref = m[4];

  // Try a provided ref first, then fall back to common branch names.
  const refCandidates = [
    ...(ref ? [ref] : []),
    ...(ref === 'main' ? [] : ['main']),
    ...(ref === 'master' ? [] : ['master']),
  ];

  return { owner, repo, refCandidates };
}

async function fetchWithTimeout(input: string, init: RequestInit & { timeoutMs: number }): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPluginManifestFromGithub(githubUrl: string): Promise<{ manifest: PluginManifest; repoUrl: string }> {
  const { owner, repo, refCandidates } = parseGitHubRepoUrl(githubUrl);

  const filename = 'plugin.manifest.json';
  for (const ref of refCandidates) {
    const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}`;
    const manifestUrl = `${rawBase}/${filename}`;
    try {
      const res = await fetchWithTimeout(manifestUrl, { method: 'GET', timeoutMs: 8000 });
      if (!res.ok) continue;
      const json = (await res.json()) as unknown;
      const manifest = parsePluginManifest(json);
      return { manifest, repoUrl: `https://github.com/${owner}/${repo}` };
    } catch {
      // Try next candidate ref.
      continue;
    }
  }

  throw new Error(`Could not fetch ${filename} from the provided GitHub repo URL.`);
}

async function checkPluginHealthById(pluginId: string): Promise<void> {
  const pluginRow = db
    .prepare<[string], PluginsRow>('SELECT * FROM plugins WHERE id = ?')
    .get(pluginId);
  if (!pluginRow) throw new Error('Plugin not found.');

  const endpointRow = db
    .prepare<[string], PluginEndpointRow>('SELECT * FROM plugin_endpoints WHERE plugin_id = ?')
    .get(pluginId);
  if (!endpointRow) throw new Error('Plugin endpoint not found.');

  let healthPath = '/health';
  try {
    const parsed = JSON.parse(pluginRow.manifest_json) as PluginManifest;
    healthPath = parsed?.service?.healthPath ?? '/health';
  } catch {
    // Ignore parse errors; keep default.
  }

  const url = `${endpointRow.base_url}${healthPath}`;
  let healthStatus = 'unknown';

  try {
    const token = resolveAuthRef(pluginId, endpointRow.auth_type, endpointRow.auth_ref);
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      timeoutMs: 5000,
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    healthStatus = res.ok ? 'healthy' : `unhealthy:${res.status}`;
  } catch {
    healthStatus = 'unhealthy:timeout';
  }

  db.prepare(
    `UPDATE plugin_endpoints
     SET health_status = ?, last_health_at = ?
     WHERE plugin_id = ?`,
  ).run(healthStatus, nowIso(), pluginId);
}

export async function listPlugins(): Promise<PluginSummary[]> {
  const rows = db
    .prepare<[], {
      id: string;
      name: string;
      version: string;
      source_url: string;
      enabled: number;
      status: string;
      updated_at: string;
      last_error: string | null;
      health_status: string;
      last_health_at: string | null;
    }>(
      `
      SELECT p.id, p.name, p.version, p.source_url, p.enabled, p.status, p.updated_at, p.last_error,
             e.health_status, e.last_health_at
      FROM plugins p
      LEFT JOIN plugin_endpoints e ON e.plugin_id = p.id
      ORDER BY p.updated_at DESC
      `,
    )
    .all();

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    version: r.version,
    sourceUrl: r.source_url,
    enabled: r.enabled === 1,
    status: r.status,
    healthStatus: r.health_status ?? 'unknown',
    lastHealthAt: r.last_health_at ?? null,
    lastError: r.last_error ?? null,
    updatedAt: r.updated_at,
  }));
}

export async function listEnabledPluginsForCapability(capability: string): Promise<PluginCapabilityProvider[]> {
  const rows = db
    .prepare<
      [string],
      {
        id: string;
        name: string;
        version: string;
        capability: string;
        method: string;
        path: string;
      }
    >(
      `
      SELECT p.id, p.name, p.version, ph.capability, ph.method, ph.path
      FROM plugin_hooks ph
      INNER JOIN plugins p ON p.id = ph.plugin_id
      WHERE ph.capability = ?
        AND ph.enabled = 1
        AND p.enabled = 1
      ORDER BY p.installed_at DESC
      `,
    )
    .all(capability);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    version: r.version,
    capability: r.capability,
    method: r.method,
    path: r.path,
  }));
}

export async function getPluginDetails(id: string): Promise<{
  plugin: PluginSummary;
  manifest: PluginManifest;
  hooks: Array<PluginHook & { enabled: boolean; permissions: string[] }>;
  uiExtensions: Array<UIExtension & { enabled: boolean; permissions: string[] }>;
  endpoint: PluginService & { authType: string; authRef: string | null };
} | null> {
  const pluginRow = db
    .prepare<[string], PluginsRow>(
      'SELECT * FROM plugins WHERE id = ?',
    )
    .get(id);
  if (!pluginRow) return null;

  const endpointRow = db
    .prepare<[string], PluginEndpointRow>(
      'SELECT * FROM plugin_endpoints WHERE plugin_id = ?',
    )
    .get(id);

  const manifest = parsePluginManifest(JSON.parse(pluginRow.manifest_json) as unknown);

  const hooksRows = db
    .prepare<[string], PluginHookRow>(
      'SELECT * FROM plugin_hooks WHERE plugin_id = ?',
    )
    .all(id);
  const hooks = hooksRows.map((r) => ({
    capability: r.capability,
    method: r.method as PluginHook['method'],
    path: r.path,
    description: undefined,
    enabled: r.enabled === 1,
    permissions: r.permissions_json ? JSON.parse(r.permissions_json) : [],
  }));

  const uiRows = db
    .prepare<[string], PluginUiExtensionRow>(
      'SELECT * FROM plugin_ui_extensions WHERE plugin_id = ?',
    )
    .all(id);
  const uiExtensions = uiRows.map((r) => ({
    slot: r.slot,
    bundleUrl: r.bundle_url,
    integrityHash: r.integrity_hash ?? undefined,
    permissions: r.permissions_json ? JSON.parse(r.permissions_json) : undefined,
    enabled: r.enabled === 1,
  })) as Array<UIExtension & { enabled: boolean; permissions: string[] }>;

  const plugin: PluginSummary = {
    id: pluginRow.id,
    name: pluginRow.name,
    version: pluginRow.version,
    sourceUrl: pluginRow.source_url,
    enabled: pluginRow.enabled === 1,
    status: pluginRow.status,
    healthStatus: endpointRow?.health_status ?? 'unknown',
    lastHealthAt: endpointRow?.last_health_at ?? null,
    lastError: pluginRow.last_error ?? null,
    updatedAt: pluginRow.updated_at,
  };

  const endpoint: PluginService & { authType: string; authRef: string | null } = {
    baseUrl: endpointRow?.base_url ?? manifest.service.baseUrl,
    healthPath: manifest.service.healthPath,
    authScheme: manifest.service.authScheme,
    requiredEnv: manifest.service.requiredEnv,
    authType: endpointRow?.auth_type ?? manifest.service.authScheme,
    authRef: endpointRow?.auth_ref ?? null,
  };

  return { plugin, manifest, hooks, uiExtensions, endpoint };
}

export async function installPluginFromGithubUrl(data: { githubUrl: string }): Promise<{ id: string }> {
  const { githubUrl } = data;
  const { manifest, repoUrl } = await fetchPluginManifestFromGithub(githubUrl);

  if (!isMuseApiCompatible(manifest.museApiVersion, HOST_MUSE_API_VERSION)) {
    throw new Error(
      `Plugin API mismatch: plugin museApiVersion=${manifest.museApiVersion} (requires major ${HOST_MUSE_API_VERSION}).`,
    );
  }

  if (!isWithinMuseVersionRange({
    pluginMinMuseVersion: manifest.minMuseVersion,
    pluginMaxMuseVersion: manifest.maxMuseVersion,
    hostMuseVersion: HOST_MUSE_VERSION,
  })) {
    throw new Error(`Plugin version range not compatible with this Muse Studio version.`);
  }

  const pluginId = manifest.id;
  const now = nowIso();
  const enabled = 0; // install but keep disabled until user explicitly enables.

  db.transaction(() => {
    db.prepare(
      `
      INSERT INTO plugins
        (id, name, version, source_url, repo, branch_or_tag, manifest_json,
         status, enabled, installed_at, updated_at, last_error)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        version = excluded.version,
        source_url = excluded.source_url,
        repo = excluded.repo,
        branch_or_tag = excluded.branch_or_tag,
        manifest_json = excluded.manifest_json,
        status = excluded.status,
        enabled = plugins.enabled,
        updated_at = excluded.updated_at,
        last_error = null
      `,
    ).run(
      pluginId,
      manifest.name,
      manifest.version,
      githubUrl.trim(),
      repoUrl,
      undefined,
      JSON.stringify(manifest),
      'installed',
      enabled,
      now,
      now,
      null,
    );

    // Endpoints
    db.prepare(
      `
      INSERT INTO plugin_endpoints
        (plugin_id, base_url, auth_type, auth_ref, health_status, last_health_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(plugin_id) DO UPDATE SET
        base_url = excluded.base_url,
        auth_type = excluded.auth_type,
        auth_ref = excluded.auth_ref,
        health_status = excluded.health_status,
        last_health_at = excluded.last_health_at
      `,
    ).run(
      pluginId,
      manifest.service.baseUrl,
      manifest.service.authScheme ?? 'none',
      null,
      'unknown',
      null,
    );

    // Replace hooks & UI extensions.
    db.prepare('DELETE FROM plugin_hooks WHERE plugin_id = ?').run(pluginId);
    db.prepare('DELETE FROM plugin_ui_extensions WHERE plugin_id = ?').run(pluginId);

    const insertHook = db.prepare(
      `
      INSERT INTO plugin_hooks
        (plugin_id, capability, method, path, permissions_json, enabled, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const hook of manifest.hooks ?? []) {
      const permissionsJson = JSON.stringify(manifest.permissions ?? []);
      insertHook.run(
        pluginId,
        hook.capability,
        hook.method,
        hook.path,
        permissionsJson,
        1,
        now,
        now,
      );
    }

    const insertUi = db.prepare(
      `
      INSERT INTO plugin_ui_extensions
        (plugin_id, slot, bundle_url, integrity_hash, permissions_json, enabled, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const ui of manifest.uiExtensions ?? []) {
      insertUi.run(
        pluginId,
        ui.slot,
        ui.bundleUrl,
        ui.integrityHash ?? null,
        JSON.stringify(ui.permissions ?? manifest.permissions ?? []),
        1,
        now,
        now,
      );
    }
  });

  await checkPluginHealthById(pluginId);
  revalidatePath('/settings/plugins');
  return { id: pluginId };
}

export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  db.prepare('UPDATE plugins SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, pluginId);
  revalidatePath('/settings/plugins');
}

export async function deletePlugin(pluginId: string): Promise<void> {
  db.prepare('DELETE FROM plugins WHERE id = ?').run(pluginId);
  revalidatePath('/settings/plugins');
}

export async function updatePlugin(pluginId: string): Promise<void> {
  const row = db
    .prepare<[string], { source_url: string }>('SELECT source_url FROM plugins WHERE id = ?')
    .get(pluginId);
  if (!row) throw new Error('Plugin not found.');
  await installPluginFromGithubUrl({ githubUrl: row.source_url });
}

export async function refreshPluginHealth(pluginId: string): Promise<void> {
  await checkPluginHealthById(pluginId);
  revalidatePath('/settings/plugins');
}

// This is the runtime host contract (used by /api/plugins/call).
export async function callEnabledPluginsForCapability(params: {
  capability: string;
  pluginId?: string;
  methodOverride?: string;
  input: unknown;
  projectId?: string;
}): Promise<{ ok: boolean; data?: unknown; error?: string; pluginId?: string }> {
  const pluginsRows = db
    .prepare<
      [string],
      {
        plugin_id: string;
        method: string;
        path: string;
        base_url: string;
        auth_type: string;
        auth_ref: string | null;
      }
    >(
      `
      SELECT ph.plugin_id, ph.method, ph.path,
             pe.base_url, pe.auth_type, pe.auth_ref
      FROM plugin_hooks ph
      INNER JOIN plugins p ON p.id = ph.plugin_id
      LEFT JOIN plugin_endpoints pe ON pe.plugin_id = p.id
      WHERE ph.capability = ?
        AND ph.enabled = 1
        AND p.enabled = 1
      ORDER BY p.installed_at DESC
      `,
    )
    .all(params.capability);

  if (pluginsRows.length === 0) {
    return { ok: false, error: `No enabled plugin registered for capability "${params.capability}".` };
  }

  const target = params.pluginId
    ? pluginsRows.find((p) => p.plugin_id === params.pluginId) ?? null
    : pluginsRows[0];
  if (!target) {
    return { ok: false, error: `Plugin "${params.pluginId}" is not enabled for "${params.capability}".` };
  }
  const url = new URL(target.path, target.base_url).toString();

  const timeoutMs = 30_000;
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;

  // MVP resilience:
  // - Retry once on network/timeouts and 5xx.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const authToken =
        target.auth_type === 'bearer'
          ? resolveAuthRef(target.plugin_id, target.auth_type, target.auth_ref)
          : null;

      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-muse-capability': params.capability,
        'x-muse-request-id': requestId,
        ...(params.projectId ? { 'x-muse-project-id': params.projectId } : {}),
        ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
      };

      const res = await fetch(url, {
        method: params.methodOverride ?? target.method,
        headers,
        body: JSON.stringify(params.input ?? {}),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        if (res.status >= 500 && attempt === 1) continue;
        return { ok: false, error: `Plugin call failed: ${res.status} ${bodyText}`, pluginId: target.plugin_id };
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        return { ok: true, data: json, pluginId: target.plugin_id };
      }
      const text = await res.text();
      return { ok: true, data: text, pluginId: target.plugin_id };
    } catch {
      if (attempt === 2) {
        return { ok: false, error: `Plugin call timeout/err (${timeoutMs}ms)`, pluginId: target.plugin_id };
      }
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, error: 'Plugin call failed after retries.', pluginId: target.plugin_id };
}

