'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { AlertCircle, Check, RefreshCcw, Trash2, Workflow, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import PluginUIHost from '@/components/plugins/PluginUIHost';
import {
  deletePlugin,
  getPluginDetails,
  installPluginFromGithubUrl,
  listPlugins,
  refreshPluginHealth,
  setPluginEnabled,
  updatePlugin,
} from '@/lib/actions/plugins';
import type { PluginSummary } from '@/lib/plugin-extension/plugin-types';

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}

function StatusBadge({ healthStatus }: { healthStatus: string }) {
  const normalized = healthStatus.toLowerCase();
  const className =
    normalized.startsWith('healthy')
      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
      : normalized.startsWith('unhealthy')
        ? 'bg-red-500/10 border-red-500/20 text-red-300'
        : 'bg-white/5 border-white/10 text-muted-foreground';

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${className}`}>
      {healthStatus}
    </span>
  );
}

export default function PluginsSettingsPage() {
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [githubUrl, setGithubUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<null | Awaited<ReturnType<typeof getPluginDetails>>>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsPluginId, setDetailsPluginId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    listPlugins().then(setPlugins).catch((e) => setError(e?.message ?? String(e)));
  }, [loaded]);

  const uiExtensionsPreview = useMemo(() => {
    if (!details?.uiExtensions) return [];
    // MVP: show the first few UI extensions.
    return details.uiExtensions.slice(0, 3);
  }, [details]);

  function reload() {
    setDetails(null);
    setDetailsPluginId(null);
    listPlugins().then(setPlugins).catch((e) => setError(e?.message ?? String(e)));
  }

  function handleAddPlugin() {
    const url = githubUrl.trim();
    if (!url) return;
    setError(null);
    startTransition(async () => {
      try {
        await installPluginFromGithubUrl({ githubUrl: url });
        setGithubUrl('');
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function handleToggleEnabled(pluginId: string, enabled: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await setPluginEnabled(pluginId, enabled);
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function handleDelete(pluginId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const ok = window.confirm('Delete this plugin? This cannot be undone.');
        if (!ok) return;
        await deletePlugin(pluginId);
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function handleRefreshHealth(pluginId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await refreshPluginHealth(pluginId);
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  async function handleViewDetails(pluginId: string) {
    setDetailsPluginId(pluginId);
    setDetailsLoading(true);
    setDetails(null);
    try {
      const d = await getPluginDetails(pluginId);
      setDetails(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailsLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">Plugin Extensions</h1>
        <p className="text-sm text-muted-foreground">
          Install Add-On PlugIns from GitHub by providing a repo URL. Plugins run as external services;
          Muse Studio controls enable/disable and capability routing.
        </p>
      </div>

      {/* Add plugin */}
      <section className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-4">
        <h2 className="text-sm font-semibold">Add Plugin</h2>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">GitHub repo URL</label>
          <textarea
            className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-violet-500/30 font-mono"
            rows={3}
            placeholder="https://github.com/owner/repo (optionally /tree/<ref>)"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground/60">
            Expected file: <span className="font-mono">plugin.manifest.json</span> at the repo root (or your provided branch/ref).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleAddPlugin} disabled={!githubUrl.trim() || isPending}>
            <Workflow className="h-3.5 w-3.5 mr-1.5" />
            Add Plugin
          </Button>
          <Button variant="outline" onClick={() => setGithubUrl('')} disabled={!githubUrl.trim() || isPending}>
            <X className="h-3.5 w-3.5 mr-1.5" />
            Clear
          </Button>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Installed Plugins ({plugins.length})</h2>
          <Badge>Unverified publisher (MVP)</Badge>
        </div>

        {plugins.length === 0 ? (
          <div className="flex items-center justify-center rounded-2xl border-2 border-dashed border-white/6 py-12">
            <div className="text-center">
              <Workflow className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/50">No plugins installed</p>
              <p className="text-xs text-muted-foreground/30 mt-1">Add a plugin using a GitHub URL above</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {plugins.map((p) => (
              <div key={p.id} className="rounded-xl border border-white/8 bg-white/3 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400 mt-0.5">
                    <Workflow className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                        v{p.version}
                      </span>
                      <StatusBadge healthStatus={p.healthStatus} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground/60">
                      Updated {new Date(p.updatedAt).toLocaleString()}
                      {p.lastHealthAt ? ` · Health ${new Date(p.lastHealthAt).toLocaleString()}` : null}
                    </div>

                    {p.lastError ? (
                      <div className="mt-2 text-[11px] text-red-300 bg-red-500/8 border border-red-500/20 rounded-lg px-2 py-1">
                        Last error: {p.lastError}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant={p.enabled ? 'default' : 'outline'}
                      className={p.enabled ? 'bg-emerald-600 hover:bg-emerald-500' : ''}
                      disabled={isPending}
                      onClick={() => handleToggleEnabled(p.id, !p.enabled)}
                    >
                      {p.enabled ? (
                        <>
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Enabled
                        </>
                      ) : (
                        'Enable'
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => handleRefreshHealth(p.id)}
                    >
                      <RefreshCcw className="h-3.5 w-3.5 mr-1" />
                      Health
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => {
                        setError(null);
                        startTransition(async () => {
                          try {
                            await updatePlugin(p.id);
                            reload();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : String(e));
                          }
                        });
                      }}
                    >
                      <RefreshCcw className="h-3.5 w-3.5 mr-1 rotate-[-20deg]" />
                      Update
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => handleViewDetails(p.id)}
                    >
                      Details
                    </Button>

                    <button
                      disabled={isPending}
                      onClick={() => handleDelete(p.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                      aria-label="Delete plugin"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {detailsPluginId === p.id && detailsLoading ? (
                  <div className="mt-3 text-xs text-muted-foreground/60">Loading plugin manifest…</div>
                ) : null}

                {detailsPluginId === p.id && details && (
                  <div className="mt-3 rounded-lg border border-white/8 bg-black/10 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-xs text-muted-foreground/60">Manifest (validated)</div>
                        <div className="text-sm font-medium truncate">{details.manifest.name}</div>
                      </div>
                      <Badge>{details.plugin.enabled ? 'Enabled' : 'Disabled'}</Badge>
                    </div>

                    {details.plugin.lastError ? (
                      <div className="text-[11px] text-red-300 bg-red-500/8 border border-red-500/20 rounded-lg px-2 py-1">
                        Last error: {details.plugin.lastError}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <div className="text-xs font-semibold">Hooks ({details.hooks.length})</div>
                      <div className="flex flex-wrap gap-2">
                        {details.hooks.length === 0 ? <span className="text-xs text-muted-foreground/60">No hooks declared.</span> : null}
                        {details.hooks.slice(0, 6).map((h) => (
                          <Badge key={h.capability}>
                            {h.capability} · {h.method}
                          </Badge>
                        ))}
                      </div>
                      {details.hooks.length > 6 ? (
                        <div className="text-xs text-muted-foreground/50">…and {details.hooks.length - 6} more</div>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold">UI Extensions (MVP preview)</div>
                      {uiExtensionsPreview.length === 0 ? (
                        <div className="text-xs text-muted-foreground/60">No UI extensions declared.</div>
                      ) : (
                        <div className="space-y-3">
                          {uiExtensionsPreview.map((ui) => (
                            <PluginUIHost
                              key={`${ui.slot}:${ui.bundleUrl}`}
                              bundleUrl={ui.bundleUrl}
                              title={details.manifest.name}
                              pluginId={details.plugin.id}
                              slot={ui.slot}
                              height={260}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Also show raw manifest JSON for debugging */}
                    <details>
                      <summary className="text-xs text-muted-foreground/70 cursor-pointer select-none">
                        Show manifest JSON
                      </summary>
                      <Textarea
                        value={JSON.stringify(details.manifest, null, 2)}
                        readOnly
                        rows={8}
                        className="mt-2 font-mono text-xs resize-none bg-black/20 border-white/10 max-h-64 overflow-y-auto"
                      />
                    </details>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

