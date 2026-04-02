import fs from 'fs';
import path from 'path';
import type { PipelineConfig, PipelineStageConfig, StylePreset, ResolutionOption } from '@/types/pipeline';

// Cache the parsed config
let _config: PipelineConfig | null = null;

export function getPipelineConfig(): PipelineConfig {
  if (_config) return _config;
  const configPath = path.join(process.cwd(), '..', 'pipeline-config', 'animation-pipeline.json');
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  _config = {
    pipeline: raw.pipeline,
    style: raw.style,
    resolution: raw.resolution,
    video_settings: raw.video_settings,
    stages: raw.stages,
    performance_baselines: raw.performance_baselines,
    ops_rules: raw.ops_rules,
  };
  return _config;
}

export function getStageConfig(stageId: string): PipelineStageConfig | undefined {
  const config = getPipelineConfig();
  return config.stages.find(s => s.id === stageId);
}

export function getStylePresets(): StylePreset[] {
  const config = getPipelineConfig();
  return [config.style.default, ...config.style.presets];
}

export function getResolutionOptions(): ResolutionOption[] {
  return getPipelineConfig().resolution.options;
}

export function resolvePrompt(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}
