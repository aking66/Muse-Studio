'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2, Maximize2, Send, Wrench, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { McpChatResponse, McpToolCallLogEntry } from '@/lib/mcp-extensions/orchestrateMcpChat';
import type { McpPendingApproval } from '@/lib/mcp-extensions/mcpChatTypes';
import type { McpExtensionsInitialLine } from '@/lib/actions/mcpExtensionsChat';
import type { McpConsolePluginGroup, McpExtensionToolDescriptor } from '@/lib/actions/plugins';
import { McpExtensionsToolsPanel } from '@/components/mcp-extensions/McpExtensionsToolsPanel';
import { getProjectById } from '@/lib/actions/projects';
import { listCharacters } from '@/lib/actions/characters';
import {
  promotePlaygroundAssetToKeyframe,
  promotePlaygroundAssetToCharacterImage,
  promotePlaygroundVideoToScene,
} from '@/lib/actions/projectMediaLibrary';
import type { CharacterImageKind } from '@/lib/types';
import type { ProjectStage } from '@/lib/types';
import { mediaKindFromRelPath, previewUrlToOutputsRelPath } from '@/lib/mcp-extensions/previewPaths';

export interface McpExtensionsProjectSummary {
  id: string;
  title: string;
  currentStage: ProjectStage;
  logline?: string;
}

type ChatLine =
  | { id?: string; role: 'user'; content: string }
  | {
      id?: string;
      role: 'assistant';
      content: string;
      toolCalls?: McpToolCallLogEntry[];
    };

const CHARACTER_KIND_OPTIONS: CharacterImageKind[] = [
  'FACE',
  'FULL_BODY',
  'EXPRESSION',
  'OUTFIT',
  'TURNAROUND',
  'ACTION',
  'OTHER',
];

interface McpExtensionsConsoleClientProps {
  initialLines: McpExtensionsInitialLine[];
  projects: McpExtensionsProjectSummary[];
  initialPluginGroups: McpConsolePluginGroup[];
  toolCatalog: McpExtensionToolDescriptor[];
}

function linesToApiPayload(
  chatLines: ChatLine[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return chatLines.map((l) =>
    l.role === 'user'
      ? { role: 'user' as const, content: l.content }
      : { role: 'assistant' as const, content: l.content },
  );
}

export function McpExtensionsConsoleClient({
  initialLines,
  projects,
  initialPluginGroups,
  toolCatalog,
}: McpExtensionsConsoleClientProps) {
  const router = useRouter();
  const [lines, setLines] = useState<ChatLine[]>(() =>
    initialLines.map((l) =>
      l.role === 'user'
        ? { id: l.id, role: 'user' as const, content: l.content }
        : {
            id: l.id,
            role: 'assistant' as const,
            content: l.content,
            toolCalls: l.toolCalls,
          },
    ),
  );
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const [lightbox, setLightbox] = useState<{ url: string; kind: 'image' | 'video' } | null>(null);

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteMode, setPromoteMode] = useState<'keyframe' | 'character' | 'video' | null>(null);
  const [promoteScenes, setPromoteScenes] = useState<
    Array<{ id: string; title: string; sceneNumber: number }>
  >([]);
  const [promoteCharacters, setPromoteCharacters] = useState<Array<{ id: string; name: string }>>([]);
  const [promoteSceneId, setPromoteSceneId] = useState('');
  const [promoteCharacterId, setPromoteCharacterId] = useState('');
  const [promoteCharKind, setPromoteCharKind] = useState<CharacterImageKind>('FACE');
  const [promoteLoadingData, setPromoteLoadingData] = useState(false);
  const [promoteSubmitting, setPromoteSubmitting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promotePickedProjectId, setPromotePickedProjectId] = useState('');
  const [promoteResultPath, setPromoteResultPath] = useState<string | null>(null);

  const [pendingApproval, setPendingApproval] = useState<McpPendingApproval | null>(null);
  const [runToolOpen, setRunToolOpen] = useState(false);
  const [runToolPick, setRunToolPick] = useState(0);
  const [runToolJson, setRunToolJson] = useState('{}');
  const [runToolError, setRunToolError] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, loading]);

  async function loadPromoteContext(projectId: string, mode: 'keyframe' | 'character' | 'video') {
    setPromoteLoadingData(true);
    try {
      if (mode === 'character') {
        const chars = await listCharacters(projectId);
        setPromoteCharacters(chars.map((c) => ({ id: c.id, name: c.name })));
        setPromoteCharacterId(chars[0]?.id ?? '');
        setPromoteCharKind('FACE');
      } else {
        const p = await getProjectById(projectId);
        const sc = (p?.scenes ?? []).map((s) => ({
          id: s.id,
          title: s.title,
          sceneNumber: s.sceneNumber,
        }));
        setPromoteScenes(sc);
        setPromoteSceneId(sc[0]?.id ?? '');
      }
    } finally {
      setPromoteLoadingData(false);
    }
  }

  async function openAssignDialog(mode: 'keyframe' | 'character' | 'video', sourceRelPath: string) {
    if (projects.length === 0) {
      setPromoteError('Create a project first under Projects.');
      setPromoteMode(mode);
      setPromoteResultPath(sourceRelPath);
      setPromoteOpen(true);
      return;
    }
    const firstId = projects[0]!.id;
    setPromotePickedProjectId(firstId);
    setPromoteResultPath(sourceRelPath);
    setPromoteError(null);
    setPromoteMode(mode);
    setPromoteOpen(true);
    await loadPromoteContext(firstId, mode);
  }

  async function handlePromoteConfirm() {
    const projectId = promotePickedProjectId;
    const resultPath = promoteResultPath;
    if (!projectId || !resultPath || !promoteMode) return;
    setPromoteSubmitting(true);
    setPromoteError(null);
    try {
      if (promoteMode === 'keyframe') {
        if (!promoteSceneId) throw new Error('Pick a scene');
        await promotePlaygroundAssetToKeyframe({
          projectId,
          sceneId: promoteSceneId,
          sourceRelPath: resultPath,
        });
      } else if (promoteMode === 'character') {
        if (!promoteCharacterId) throw new Error('Pick a character');
        await promotePlaygroundAssetToCharacterImage({
          projectId,
          characterId: promoteCharacterId,
          sourceRelPath: resultPath,
          kind: promoteCharKind,
        });
      } else if (promoteMode === 'video') {
        if (!promoteSceneId) throw new Error('Pick a scene');
        await promotePlaygroundVideoToScene({
          projectId,
          sceneId: promoteSceneId,
          sourceRelPath: resultPath,
        });
      }
      setPromoteOpen(false);
      setPromoteMode(null);
      setPromoteResultPath(null);
      router.refresh();
    } catch (e) {
      setPromoteError(e instanceof Error ? e.message : 'Assignment failed');
    } finally {
      setPromoteSubmitting(false);
    }
  }

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userLine: ChatLine = { role: 'user', content: text };
    const nextLines: ChatLine[] = [...lines, userLine];
    setLines(nextLines);
    setInput('');
    setPendingApproval(null);
    setLoading(true);

    try {
      const payload = linesToApiPayload(nextLines);

      const res = await fetch('/api/mcp-extensions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }),
      });

      const data = (await res.json()) as McpChatResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      setLines((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.assistantText ?? '',
          toolCalls: data.toolCalls ?? [],
        },
      ]);
      setPendingApproval(data.pendingApproval ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLines((prev) => [...prev, { role: 'assistant', content: `**Error:** ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, lines, loading]);

  const confirmPendingTool = useCallback(async () => {
    if (!pendingApproval || loading) return;
    const toRun = pendingApproval;
    const approveLine: ChatLine = {
      role: 'user',
      content: `✓ Approve running ${toRun.capability} (${toRun.pluginName})`,
    };
    const nextLines = [...linesRef.current, approveLine];
    setLines(nextLines);
    setPendingApproval(null);
    setLoading(true);
    try {
      const res = await fetch('/api/mcp-extensions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: linesToApiPayload(nextLines),
          approvePending: {
            capability: toRun.capability,
            pluginId: toRun.pluginId,
            input: toRun.input,
          },
        }),
      });
      const data = (await res.json()) as McpChatResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setLines((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.assistantText ?? '',
          toolCalls: data.toolCalls ?? [],
        },
      ]);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLines((prev) => [...prev, { role: 'assistant', content: `**Error:** ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }, [pendingApproval, loading, router]);

  const runQuickTool = useCallback(async () => {
    const t = toolCatalog[runToolPick];
    if (!t || loading) return;
    let input: unknown = {};
    try {
      input = runToolJson.trim() ? JSON.parse(runToolJson) : {};
    } catch {
      setRunToolError('Invalid JSON in tool arguments.');
      return;
    }
    setRunToolError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/mcp-extensions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [],
          executeTool: {
            capability: t.capability,
            pluginId: t.pluginId,
            input,
            note: `Quick run: ${t.capability} (${t.pluginName})`,
          },
        }),
      });
      const data = (await res.json()) as McpChatResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      const userContent = `Quick run: ${t.capability} (${t.pluginName})`;
      setLines((prev) => [
        ...prev,
        { role: 'user', content: userContent },
        {
          role: 'assistant',
          content: data.assistantText ?? '',
          toolCalls: data.toolCalls ?? [],
        },
      ]);
      setRunToolOpen(false);
      setPendingApproval(null);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRunToolError(msg);
    } finally {
      setLoading(false);
    }
  }, [toolCatalog, runToolPick, runToolJson, loading, router]);

  function renderMediaPreview(p: { kind: string; url?: string; label?: string }, key: number) {
    const rel = p.url ? previewUrlToOutputsRelPath(p.url) : null;
    const fileKind = rel ? mediaKindFromRelPath(rel) : null;

    const openLightbox = () => {
      if (!p.url) return;
      if (p.kind === 'image' || fileKind === 'image') setLightbox({ url: p.url, kind: 'image' });
      else if (p.kind === 'video' || fileKind === 'video') setLightbox({ url: p.url, kind: 'video' });
    };

    const assignButtons =
      rel && fileKind === 'image' ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 text-[10px]"
            onClick={() => void openAssignDialog('keyframe', rel)}
          >
            Assign to keyframe…
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            onClick={() => void openAssignDialog('character', rel)}
          >
            Assign to character…
          </Button>
        </div>
      ) : rel && fileKind === 'video' ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 text-[10px]"
            onClick={() => void openAssignDialog('video', rel)}
          >
            Assign video to scene…
          </Button>
        </div>
      ) : null;

    if (p.kind === 'image' && p.url) {
      return (
        <div key={key} className="space-y-1">
          <button
            type="button"
            onClick={openLightbox}
            className="group relative block max-w-full rounded-md border border-white/10 bg-black/40 text-left outline-none ring-offset-2 ring-offset-black/40 focus-visible:ring-2 focus-visible:ring-violet-500"
            title="View full size"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt={p.label ?? ''}
              className="max-h-48 w-auto rounded-md object-contain transition group-hover:opacity-95"
            />
            <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white/90 opacity-0 shadow group-hover:opacity-100">
              <Maximize2 className="h-3.5 w-3.5" />
            </span>
          </button>
          {assignButtons}
        </div>
      );
    }
    if (p.kind === 'video' && p.url) {
      return (
        <div key={key} className="space-y-1">
          <div className="relative inline-block max-w-full rounded-md border border-white/10 bg-black/40">
            <video src={p.url} controls className="max-h-56 max-w-full rounded-md object-contain" />
            <button
              type="button"
              onClick={openLightbox}
              className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-md bg-black/70 text-white/95 shadow-md ring-1 ring-white/15 transition hover:bg-black/85"
              title="View full size"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
          {assignButtons}
        </div>
      );
    }
    return (
      <pre
        key={key}
        className="text-[11px] text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto"
      >
        {p.label ?? p.url ?? ''}
      </pre>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-white/8 px-4 py-3">
        <h1 className="text-sm font-semibold text-foreground">Extensions</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Chat with the configured LLM to run tools on your registered extensions. Register servers under{' '}
          <Link href="/settings/extensions" className="text-violet-400 hover:underline">
            Settings → Extensions
          </Link>
          . Use the right panel to enable tools and set <span className="text-amber-200/90">Ask</span> vs{' '}
          <span className="text-muted-foreground">Auto</span>. History is saved locally. Assign media from the
          buttons under each image or video.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {lines.length === 0 && !loading && (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-muted-foreground">
              Ask to generate an image, run a capability, or describe what you want an extension to do.
            </div>
          )}

          {lines.map((line, i) => (
            <div
              key={line.id ?? `line-${i}`}
              className={cn('flex', line.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[min(100%,720px)] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  line.role === 'user'
                    ? 'bg-violet-600/25 border border-violet-500/25 text-foreground'
                    : 'bg-white/5 border border-white/10 text-foreground/95',
                )}
              >
                {line.role === 'assistant' && line.toolCalls && line.toolCalls.length > 0 ? (
                  <div className="space-y-3">
                    {line.toolCalls.map((tc, j) => (
                      <div
                        key={j}
                        className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-mono"
                      >
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Wrench className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {tc.pluginName ?? tc.pluginId ?? 'extension'} · {tc.capability} ·{' '}
                            <span
                              className={tc.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}
                            >
                              {tc.status}
                            </span>
                          </span>
                        </div>
                        {tc.error ? (
                          <p className="text-red-300 whitespace-pre-wrap">{tc.error}</p>
                        ) : null}
                        {tc.previews.length > 0 ? (
                          <div className="flex flex-col gap-2 mt-2">
                            {tc.previews.map((p, k) => renderMediaPreview(p, k))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {line.content ? <div className="whitespace-pre-wrap">{line.content}</div> : null}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{line.content}</div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                Thinking…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <aside className="hidden min-h-0 lg:flex lg:flex-col">
          <McpExtensionsToolsPanel initialGroups={initialPluginGroups} />
        </aside>
      </div>

      <div className="border-t border-white/8 p-4 space-y-3">
        {pendingApproval ? (
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95">
            <span className="min-w-0 flex-1">
              Pending tool: <span className="font-mono">{pendingApproval.capability}</span> —{' '}
              {pendingApproval.pluginName}
            </span>
            <Button
              type="button"
              size="sm"
              className="h-8 bg-violet-600 hover:bg-violet-500"
              disabled={loading}
              onClick={() => void confirmPendingTool()}
            >
              Run tool
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-muted-foreground"
              disabled={loading}
              onClick={() => setPendingApproval(null)}
            >
              Dismiss
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-2 max-w-4xl mx-auto w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1 border-white/12 bg-white/5 text-xs"
            disabled={loading || toolCatalog.length === 0}
            onClick={() => {
              setRunToolError(null);
              setRunToolPick((i) => Math.min(i, Math.max(0, toolCatalog.length - 1)));
              setRunToolOpen(true);
            }}
          >
            <Zap className="h-3.5 w-3.5" />
            Run MCP tool…
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe what you want (e.g. generate an image of a sunset over mountains)…"
            rows={2}
            disabled={loading}
            className="min-w-0 flex-1 resize-none border-white/10 bg-black/30 text-sm min-h-[72px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button
            className="shrink-0 self-end bg-violet-600 hover:bg-violet-500 h-10 px-4"
            disabled={loading || !input.trim()}
            onClick={() => void send()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <Dialog
        open={runToolOpen}
        onOpenChange={(o) => {
          setRunToolOpen(o);
          if (!o) setRunToolError(null);
        }}
      >
        <DialogContent className="border-white/10 bg-[oklch(0.13_0.012_264)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Run MCP tool</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Call a tool directly (bypasses the LLM). Use JSON for arguments — e.g.{' '}
            <code className="rounded bg-white/10 px-1">{`{"prompt":"a cat"}`}</code> for image generation.
          </p>
          {toolCatalog.length === 0 ? (
            <p className="text-sm text-amber-400/90">No tools in the catalog. Enable extensions in the right panel.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tool</label>
                <select
                  value={runToolPick}
                  onChange={(e) => setRunToolPick(Number(e.target.value))}
                  className="w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-xs font-mono"
                >
                  {toolCatalog.map((t, i) => (
                    <option key={`${t.pluginId}:${t.capability}:${i}`} value={i}>
                      {t.pluginName} · {t.capability} ({t.path})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Arguments (JSON)</label>
                <Textarea
                  value={runToolJson}
                  onChange={(e) => setRunToolJson(e.target.value)}
                  rows={6}
                  className="resize-y font-mono text-xs border-white/10 bg-black/40"
                />
              </div>
              {runToolError ? <p className="text-xs text-red-400">{runToolError}</p> : null}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRunToolOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-violet-600 hover:bg-violet-500"
              disabled={loading || toolCatalog.length === 0}
              onClick={() => void runQuickTool()}
            >
              {loading ? 'Running…' : 'Run'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lightbox !== null} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-h-[96vh] w-[96vw] max-w-[96vw] border-white/10 bg-black/95 p-2 sm:max-w-[96vw]">
          <div className="flex max-h-[90vh] items-center justify-center overflow-auto">
            {lightbox?.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lightbox.url}
                alt=""
                className="max-h-[85vh] max-w-full object-contain"
              />
            ) : lightbox?.kind === 'video' ? (
              <video src={lightbox.url} controls className="max-h-[85vh] max-w-full" autoPlay />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={promoteOpen}
        onOpenChange={(open) => {
          setPromoteOpen(open);
          if (!open) {
            setPromoteMode(null);
            setPromoteError(null);
            setPromoteResultPath(null);
          }
        }}
      >
        <DialogContent className="border-white/10 bg-[oklch(0.13_0.012_264)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {promoteMode === 'keyframe' && 'Assign image as keyframe'}
              {promoteMode === 'character' && 'Add image to character'}
              {promoteMode === 'video' && 'Assign video to scene'}
            </DialogTitle>
          </DialogHeader>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Create a project under{' '}
              <Link href="/projects" className="text-violet-400 hover:underline">
                Projects
              </Link>{' '}
              to attach outputs.
            </p>
          ) : promoteLoadingData ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Project</label>
                <select
                  value={promotePickedProjectId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setPromotePickedProjectId(id);
                    if (promoteMode) void loadPromoteContext(id, promoteMode);
                  }}
                  className="w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-xs"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              {(promoteMode === 'keyframe' || promoteMode === 'video') && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Scene</label>
                  {promoteScenes.length === 0 ? (
                    <p className="text-xs text-amber-400/90">No scenes in this project yet.</p>
                  ) : (
                    <select
                      value={promoteSceneId}
                      onChange={(e) => setPromoteSceneId(e.target.value)}
                      className="w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-xs"
                    >
                      {promoteScenes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.sceneNumber}. {s.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {promoteMode === 'character' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Character</label>
                    {promoteCharacters.length === 0 ? (
                      <p className="text-xs text-amber-400/90">No characters in this project yet.</p>
                    ) : (
                      <select
                        value={promoteCharacterId}
                        onChange={(e) => setPromoteCharacterId(e.target.value)}
                        className="w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-xs"
                      >
                        {promoteCharacters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Image kind</label>
                    <select
                      value={promoteCharKind}
                      onChange={(e) => setPromoteCharKind(e.target.value as CharacterImageKind)}
                      className="w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-xs"
                    >
                      {CHARACTER_KIND_OPTIONS.map((k) => (
                        <option key={k} value={k}>
                          {k.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <p className="text-[11px] text-muted-foreground/70">
                The file is copied into your project library or character refs; the extension output file
                stays in place.
              </p>
              {promoteError && <p className="text-xs text-red-400">{promoteError}</p>}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPromoteOpen(false)}
              disabled={promoteSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-violet-600 hover:bg-violet-500"
              disabled={
                promoteSubmitting ||
                promoteLoadingData ||
                projects.length === 0 ||
                !promotePickedProjectId ||
                (promoteMode === 'character' && promoteCharacters.length === 0) ||
                ((promoteMode === 'keyframe' || promoteMode === 'video') && promoteScenes.length === 0)
              }
              onClick={() => void handlePromoteConfirm()}
            >
              {promoteSubmitting ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
