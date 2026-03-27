import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  runPluginImageGeneration,
  runPluginVideoGeneration,
} from '@/lib/plugin-extension/provider-adapter';
import type {
  MuseImageGenerateInput,
  MuseVideoGenerateInput,
} from '@/lib/plugin-extension/provider-contracts';

export const dynamic = 'force-dynamic';

type PluginGeneratePayload = {
  plugin_id?: string;
  kind: 'image' | 'video';
  scene_id: string;
  project_id?: string | null;
  input: MuseImageGenerateInput | MuseVideoGenerateInput;
};

function resolveProjectId(sceneId: string, projectId?: string | null): string | null {
  if (projectId) return projectId;
  if (sceneId === 'playground') return null;
  const row = db
    .prepare<[string], { project_id: string }>('SELECT project_id FROM scenes WHERE id = ?')
    .get(sceneId);
  return row?.project_id ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PluginGeneratePayload;
    const kind = body.kind;
    const sceneId = body.scene_id;
    if (!kind || !sceneId || !body.input) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const projectId = resolveProjectId(sceneId, body.project_id);
    const targetRelDir =
      sceneId === 'playground'
        ? `drafts/playground/${projectId ?? 'global'}`
        : `drafts/${projectId ?? 'orphan'}/library`;

    if (kind === 'image') {
      const out = await runPluginImageGeneration({
        pluginId: body.plugin_id,
        input: body.input as MuseImageGenerateInput,
        targetRelDir,
        projectId: projectId ?? undefined,
      });
      // Provider telemetry (MVP): capability + plugin + scene for debugging.
      console.info('[plugin-provider:image.generate]', {
        scene_id: sceneId,
        project_id: projectId,
        plugin_id: out.pluginId ?? body.plugin_id ?? null,
        output_path: out.outputRelPath,
      });
      return NextResponse.json({
        provider: 'plugin',
        plugin_id: out.pluginId ?? body.plugin_id ?? null,
        output_path: out.outputRelPath,
        output_url: `/api/outputs/${out.outputRelPath}`,
        metadata: out.response.metadata ?? null,
      });
    }

    const out = await runPluginVideoGeneration({
      pluginId: body.plugin_id,
      input: body.input as MuseVideoGenerateInput,
      targetRelDir,
      projectId: projectId ?? undefined,
    });
    console.info('[plugin-provider:video.generate]', {
      scene_id: sceneId,
      project_id: projectId,
      plugin_id: out.pluginId ?? body.plugin_id ?? null,
      output_path: out.outputRelPath,
    });
    return NextResponse.json({
      provider: 'plugin',
      plugin_id: out.pluginId ?? body.plugin_id ?? null,
      output_path: out.outputRelPath,
      output_url: `/api/outputs/${out.outputRelPath}`,
      metadata: out.response.metadata ?? null,
      duration_sec: out.response.finalVideo.durationSec ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Plugin provider generation failed' },
      { status: 500 },
    );
  }
}

