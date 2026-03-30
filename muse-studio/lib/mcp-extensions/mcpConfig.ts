export interface ParsedMcpInstallEntry {
  serverName: string;
  baseUrl: string;
}

/** Normalize and validate an HTTP(S) base URL for Muse plugin manifests (Settings + pasted JSON config). */
export function normalizePluginBaseUrl(input: string): string {
  const raw = input.trim().replace(/\/+$/, '');
  if (!raw) throw new Error('Extension URL is required.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL. Use http:// or https:// (example: http://127.0.0.1:18182).');
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('URL must use http:// or https://');
  }
  return url.toString().replace(/\/+$/, '');
}

/**
 * Parse JSON with top-level `mcpServers` (common editor shape). v1 installs only remote entries that declare
 * a string `url` or `baseUrl` (HTTP Muse extension). Command/stdio-only servers are skipped with warnings.
 */
export function parseMcpServersConfig(raw: string): { entries: ParsedMcpInstallEntry[]; warnings: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON: could not parse. Check commas and quotes.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON must be an object with an "mcpServers" property.');
  }
  const root = parsed as Record<string, unknown>;
  const mcpServers = root.mcpServers;
  if (!mcpServers || typeof mcpServers !== 'object' || Array.isArray(mcpServers)) {
    throw new Error('Missing or invalid "mcpServers" object. Expected: { "mcpServers": { "name": { ... } } }');
  }

  const entries: ParsedMcpInstallEntry[] = [];
  const warnings: string[] = [];

  for (const [serverName, cfg] of Object.entries(mcpServers)) {
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
      warnings.push(`Skipped "${serverName}": entry must be an object.`);
      continue;
    }
    const c = cfg as Record<string, unknown>;
    const urlRaw =
      typeof c.url === 'string' && c.url.trim()
        ? c.url.trim()
        : typeof c.baseUrl === 'string' && c.baseUrl.trim()
          ? c.baseUrl.trim()
          : null;

    if (urlRaw) {
      try {
        entries.push({ serverName, baseUrl: normalizePluginBaseUrl(urlRaw) });
      } catch (e) {
        warnings.push(`Skipped "${serverName}": ${e instanceof Error ? e.message : String(e)}`);
      }
      continue;
    }

    if (typeof c.command === 'string' || Array.isArray(c.args)) {
      warnings.push(
        `Skipped "${serverName}": stdio/command-based servers are not installed from this screen in v1. Use an HTTP "url" for a Muse-compatible extension, or run those servers outside Muse Studio.`,
      );
      continue;
    }

    warnings.push(`Skipped "${serverName}": no supported "url" or "baseUrl" field found.`);
  }

  if (entries.length === 0 && warnings.length === 0) {
    warnings.push('No entries found under mcpServers.');
  }

  return { entries, warnings };
}
