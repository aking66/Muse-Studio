export type MuseImageGenerateInput = {
  projectId?: string;
  sceneId?: string;
  keyframeId?: string;
  sequenceOrder?: number;
  prompt: string;
  generationParams?: {
    denoiseStrength?: number;
    styleStrength?: number;
    aspectRatio?: string;
    referenceWeight?: number;
  };
  referenceImages?: Array<{
    url: string;
    width?: number;
    height?: number;
    alt?: string;
  }>;
  pluginParams?: Record<string, unknown>;
};

export type MuseImageGenerateOutput = {
  finalImage: {
    url: string;
    width?: number;
    height?: number;
    alt?: string;
  };
  draftImage?: {
    url: string;
    width?: number;
    height?: number;
    alt?: string;
  };
  metadata?: Record<string, unknown>;
};

export type MuseVideoGenerateInput = {
  projectId?: string;
  sceneId?: string;
  prompt?: string;
  sourceImages?: Array<{
    url: string;
    width?: number;
    height?: number;
  }>;
  generationParams?: {
    durationSec?: number;
    fps?: number;
    aspectRatio?: string;
    seed?: number;
  };
  pluginParams?: Record<string, unknown>;
};

export type MuseVideoGenerateOutput = {
  finalVideo: {
    url: string;
    durationSec?: number;
  };
  metadata?: Record<string, unknown>;
};

