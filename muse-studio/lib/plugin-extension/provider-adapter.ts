import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { callEnabledPluginsForCapability } from '@/lib/actions/plugins';
import type {
  MuseImageGenerateInput,
  MuseImageGenerateOutput,
  MuseVideoGenerateInput,
  MuseVideoGenerateOutput,
} from '@/lib/plugin-extension/provider-contracts';

const OUTPUTS_ROOT = path.join(process.cwd(), 'outputs');

function toPosix(rel: string): string {
  return rel.split(path.sep).join('/');
}

function safeResolveUnderOutputs(rel: string): string {
  const cleaned = toPosix(rel).replace(/^\/+/, '');
  const abs = path.resolve(path.join(OUTPUTS_ROOT, ...cleaned.split('/')));
  const root = path.resolve(OUTPUTS_ROOT);
  if (!abs.startsWith(root)) throw new Error('Invalid output path');
  return abs;
}

function extFromInput(value: string, fallback: '.png' | '.mp4'): string {
  try {
    const u = new URL(value);
    const ext = path.extname(u.pathname).toLowerCase();
    if (ext) return ext;
  } catch {
    const ext = path.extname(value).toLowerCase();
    if (ext) return ext;
  }
  return fallback;
}

async function writeFromUrl(url: string, absDest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch plugin output: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(absDest), { recursive: true });
  fs.writeFileSync(absDest, buf);
}

function copyFromOutputRel(relPath: string, absDest: string): void {
  const src = safeResolveUnderOutputs(relPath);
  if (!fs.existsSync(src)) throw new Error('Plugin output path does not exist under outputs/');
  fs.mkdirSync(path.dirname(absDest), { recursive: true });
  fs.copyFileSync(src, absDest);
}

export async function normalizePluginOutputToOutputs(params: {
  value: string;
  kind: 'image' | 'video';
  targetRelDir: string;
}): Promise<string> {
  const ext = extFromInput(params.value, params.kind === 'image' ? '.png' : '.mp4');
  const filename = `${randomUUID()}${ext}`;
  const relOut = toPosix(path.join(params.targetRelDir, filename));
  const absOut = safeResolveUnderOutputs(relOut);

  if (params.value.startsWith('/api/outputs/')) {
    const rel = params.value.replace(/^\/api\/outputs\//, '');
    copyFromOutputRel(rel, absOut);
    return relOut;
  }

  if (/^(https?:)?\/\//i.test(params.value)) {
    await writeFromUrl(params.value, absOut);
    return relOut;
  }

  // Treat as output-relative path.
  copyFromOutputRel(params.value, absOut);
  return relOut;
}

export async function runPluginImageGeneration(params: {
  pluginId?: string;
  input: MuseImageGenerateInput;
  targetRelDir: string;
  projectId?: string;
}): Promise<{
  outputRelPath: string;
  pluginId?: string;
  response: MuseImageGenerateOutput;
}> {
  const call = await callEnabledPluginsForCapability({
    capability: 'image.generate',
    pluginId: params.pluginId,
    input: params.input,
    projectId: params.projectId,
  });
  if (!call.ok) throw new Error(call.error ?? 'Plugin image generation failed');

  const data = call.data as MuseImageGenerateOutput;
  const finalUrl = data?.finalImage?.url;
  if (!finalUrl) throw new Error('Plugin image response missing finalImage.url');

  const outputRelPath = await normalizePluginOutputToOutputs({
    value: finalUrl,
    kind: 'image',
    targetRelDir: params.targetRelDir,
  });

  return { outputRelPath, pluginId: call.pluginId, response: data };
}

export async function runPluginVideoGeneration(params: {
  pluginId?: string;
  input: MuseVideoGenerateInput;
  targetRelDir: string;
  projectId?: string;
}): Promise<{
  outputRelPath: string;
  pluginId?: string;
  response: MuseVideoGenerateOutput;
}> {
  const call = await callEnabledPluginsForCapability({
    capability: 'video.generate',
    pluginId: params.pluginId,
    input: params.input,
    projectId: params.projectId,
  });
  if (!call.ok) throw new Error(call.error ?? 'Plugin video generation failed');

  const data = call.data as MuseVideoGenerateOutput;
  const finalUrl = data?.finalVideo?.url;
  if (!finalUrl) throw new Error('Plugin video response missing finalVideo.url');

  const outputRelPath = await normalizePluginOutputToOutputs({
    value: finalUrl,
    kind: 'video',
    targetRelDir: params.targetRelDir,
  });

  return { outputRelPath, pluginId: call.pluginId, response: data };
}

