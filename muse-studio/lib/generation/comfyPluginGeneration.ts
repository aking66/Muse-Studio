import type { ComfyDynamicInput } from '@/lib/comfy-parser';

export type GenerationKind = 'image' | 'video';

/** Merge numeric/text defaults with uploaded file paths (same as Kanban + Playground). */
export function mergeComfyMergedValues(
  inputValues: Record<string, string | number | null | undefined>,
  filePaths: Record<string, string>,
): Record<string, string | number | null> {
  const merged: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(inputValues)) {
    merged[k] = v === undefined ? null : v;
  }
  for (const [nodeId, relPath] of Object.entries(filePaths)) {
    merged[nodeId] = relPath;
  }
  return merged;
}

/** Reference image list for plugin-provider image/video payloads. */
export function referenceImagesFromFilePaths(filePaths: Record<string, string>): Array<{ url: string }> {
  return Object.entries(filePaths).map(([, relPath]) => ({
    url: `/api/outputs/${relPath}`,
  }));
}

export function promptFromFirstTextInput(
  inputs: ComfyDynamicInput[],
  mergedValues: Record<string, string | number | null>,
): string {
  const textInputs = inputs.filter((i) => i.kind === 'text' || i.kind === 'textarea');
  const nodeId = textInputs[0]?.nodeId;
  return nodeId ? String(mergedValues[nodeId] ?? '').trim() : '';
}

export function buildComfyUiGeneratePayload(params: {
  workflowId: string;
  sceneId: string;
  kind: GenerationKind;
  mergedValues: Record<string, string | number | null>;
  projectId?: string | null;
}) {
  return {
    workflow_id: params.workflowId,
    scene_id: params.sceneId,
    kind: params.kind,
    inputValues: params.mergedValues,
    ...(params.projectId ? { project_id: params.projectId } : {}),
  };
}

export function buildPluginProviderPayload(params: {
  pluginId: string;
  sceneId: string;
  kind: GenerationKind;
  mergedValues: Record<string, string | number | null>;
  referenceImages: Array<{ url: string }>;
  prompt: string;
  projectId?: string | null;
  /** Used when kind === 'image' and prompt is empty */
  imagePromptFallback?: string;
}) {
  const projectId = params.projectId ?? undefined;
  return {
    plugin_id: params.pluginId,
    scene_id: params.sceneId,
    kind: params.kind,
    ...(params.projectId ? { project_id: params.projectId } : {}),
    input:
      params.kind === 'image'
        ? {
            projectId,
            sceneId: params.sceneId,
            prompt: params.prompt || params.imagePromptFallback || 'Generate image',
            generationParams: {},
            referenceImages: params.referenceImages,
            pluginParams: { rawInputs: params.mergedValues },
          }
        : {
            projectId,
            sceneId: params.sceneId,
            prompt: params.prompt || undefined,
            sourceImages: params.referenceImages,
            generationParams: {},
            pluginParams: { rawInputs: params.mergedValues },
          },
  };
}
