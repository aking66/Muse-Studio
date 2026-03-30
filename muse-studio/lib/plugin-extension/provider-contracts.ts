/**
 * DTO shapes for plugin HTTP hooks (`image.generate` / `video.generate`).
 * Kept in-repo (replacing removed `@muse/plugin-host`) to match Python plugin schemas.
 */

export interface MuseImageGenerateInput {
  projectId?: string;
  sceneId?: string;
  keyframeId?: string;
  sequenceOrder?: number;
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  numInferenceSteps?: number;
  generationParams?: Record<string, unknown>;
  referenceImages?: Array<{ url: string; width?: number; height?: number; alt?: string }>;
  pluginParams?: Record<string, unknown>;
}

export interface ImageAsset {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface MuseImageGenerateOutput {
  finalImage: ImageAsset;
  draftImage?: ImageAsset;
  metadata?: Record<string, unknown>;
}

export interface MuseVideoGenerateInput {
  projectId?: string;
  sceneId?: string;
  prompt?: string;
  [key: string]: unknown;
}

export interface VideoAsset {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  durationSec?: number;
}

export interface MuseVideoGenerateOutput {
  finalVideo: VideoAsset;
  draftVideo?: VideoAsset;
  metadata?: Record<string, unknown>;
}

export interface PluginHookCallRequest {
  capability: string;
  input: unknown;
}

export interface PluginHookCallResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}
