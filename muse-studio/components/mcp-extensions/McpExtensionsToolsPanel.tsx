'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Hammer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  type McpConsolePluginGroup,
  setPluginEnabled,
  setPluginHookEnabled,
  setPluginHookMcpPolicy,
} from '@/lib/actions/plugins';

function ToggleSwitch({
  checked,
  onCheckedChange,
  disabled,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 rounded-full border border-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50',
        checked ? 'bg-violet-600' : 'bg-white/15',
      )}
    >
      <span
        className={cn(
          'pointer-events-none block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export function McpExtensionsToolsPanel({ initialGroups }: { initialGroups: McpConsolePluginGroup[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const g of initialGroups) o[g.pluginId] = true;
    return o;
  });

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col border-l border-white/8 bg-[oklch(0.12_0.01_264)]">
      <div className="border-b border-white/8 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          MCP tools
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">
          Toggle extensions and each tool. <span className="text-amber-200/80">Ask</span> waits for your
          confirmation in chat before running.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[10px] text-muted-foreground"
            disabled={pending}
            onClick={() => refresh()}
          >
            <RefreshCw className={cn('h-3 w-3', pending && 'animate-spin')} />
            Refresh
          </Button>
          <Link
            href="/settings/extensions"
            className="inline-flex h-7 items-center rounded-md px-2 text-[10px] text-violet-400 hover:underline"
          >
            Manage servers
          </Link>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {initialGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No extensions yet. Add an MCP server under{' '}
            <Link href="/settings/extensions" className="text-violet-400 hover:underline">
              Settings → Extensions
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {initialGroups.map((g) => (
              <li key={g.pluginId} className="rounded-lg border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-2 px-2 py-2">
                  <ToggleSwitch
                    checked={g.enabled}
                    aria-label={`Enable ${g.pluginName}`}
                    onCheckedChange={(v) => {
                      startTransition(async () => {
                        await setPluginEnabled(g.pluginId, v);
                        refresh();
                      });
                    }}
                  />
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1 text-left text-xs font-medium text-amber-200/95"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [g.pluginId]: !prev[g.pluginId] }))
                    }
                  >
                    {expanded[g.pluginId] ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    )}
                    <span className="truncate">{g.pluginName}</span>
                  </button>
                  <Hammer className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                </div>
                {expanded[g.pluginId] && g.hooks.length > 0 ? (
                  <div className="border-t border-white/6 px-2 py-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                        <Hammer className="h-3 w-3" />
                        Tools
                      </span>
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground/50">Per tool</span>
                    </div>
                    <ul className="space-y-2">
                      {g.hooks.map((h) => (
                        <li
                          key={`${g.pluginId}:${h.capability}`}
                          className="rounded-md border border-white/6 bg-black/25 px-2 py-1.5"
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-black/40"
                              checked={h.enabled}
                              title="Enable this tool for the LLM catalog"
                              onChange={(e) => {
                                startTransition(async () => {
                                  await setPluginHookEnabled(g.pluginId, h.capability, e.target.checked);
                                  refresh();
                                });
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-mono text-[10px] text-foreground/90" title={h.path}>
                                {h.path}
                              </p>
                              <p className="truncate text-[9px] text-muted-foreground/70">{h.capability}</p>
                            </div>
                            <select
                              value={h.mcpPolicy}
                              disabled={!h.enabled}
                              onChange={(e) => {
                                const v = e.target.value === 'ask' ? 'ask' : 'auto';
                                startTransition(async () => {
                                  await setPluginHookMcpPolicy(g.pluginId, h.capability, v);
                                  refresh();
                                });
                              }}
                              className="max-w-[5.5rem] shrink-0 rounded border border-white/12 bg-black/50 px-1 py-0.5 text-[9px]"
                            >
                              <option value="auto">Auto</option>
                              <option value="ask">Ask</option>
                            </select>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {expanded[g.pluginId] && g.hooks.length === 0 ? (
                  <p className="border-t border-white/6 px-2 py-2 text-[10px] text-muted-foreground">
                    No tool hooks declared for this entry.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
