// Stage status - visual states for the timeline
export type PipelineStageStatus = 'locked' | 'active' | 'generating' | 'review' | 'approved' | 'failed';

// Stage kind
export type StageKind = 'image' | 'video';

// Style preset from pipeline config
export interface StylePreset {
  id: string;
  name: string;
  keywords: string;
  negative: string;
}

// Single stage state
export interface PipelineStageState {
  id: string;           // "1A", "1B", "2", "3", "4A", "4B", "5"
  name: string;         // "Character Sketch", etc.
  status: PipelineStageStatus;
  kind: StageKind;
  prompt: string;       // resolved prompt
  promptTemplate: string;
  styleApplied: boolean; // whether style keywords are injected
  jobId?: string;
  outputPath?: string;
  errorMessage?: string;
  startedAt?: number;
  completedAt?: number;
  durationSec?: number;
  cost?: number;
}

// Resolution config
export interface ResolutionOption {
  width: number;
  height: number;
  aspect: string;
  label: string;
}

// Full pipeline state (for useReducer)
export interface PipelineState {
  projectId: string;
  projectTitle: string;
  characterName: string;
  characterDescription: string;
  stylePresetId: string;
  styleKeywords: string;
  styleNegative: string;
  resolution: ResolutionOption;
  stages: Record<string, PipelineStageState>;
  stageOrder: string[];  // ["1A", "1B", "2", "3", "4A", "4B", "5"]
  activeStageId: string;
  totalCost: number;
  totalTimeSec: number;
  isRunning: boolean;
  opsExpanded: boolean;
}

// Reducer actions
export type PipelineAction =
  | { type: 'SET_STYLE'; presetId: string; keywords: string; negative: string }
  | { type: 'SET_ACTIVE_STAGE'; stageId: string }
  | { type: 'UPDATE_PROMPT'; stageId: string; prompt: string }
  | { type: 'START_GENERATING'; stageId: string; jobId?: string }
  | { type: 'STAGE_PROGRESS'; stageId: string; progress: number }
  | { type: 'STAGE_COMPLETED'; stageId: string; outputPath: string; durationSec: number; cost: number }
  | { type: 'STAGE_FAILED'; stageId: string; error: string }
  | { type: 'APPROVE_STAGE'; stageId: string }
  | { type: 'RETRY_STAGE'; stageId: string }
  | { type: 'TOGGLE_OPS'; }
  | { type: 'RESET_PIPELINE' };

// Pipeline config types (from JSON)
export interface PipelineStageConfig {
  id: string;
  name: string;
  purpose: string;
  workflow: string;
  model: string;
  kind: StageKind;
  style_applied: boolean;
  prompt_template: string | { positive: string; negative: string };
  inputs: Record<string, {
    field: string;
    value: string;
    source: string;
    role?: string;
    note?: string;
    optional?: boolean;
    fallback?: string;
  }>;
  output: string;
  output_used_by: string[];
  critical_lesson?: string;
  motion_rule?: string;
  performance?: {
    first_run_sec?: number;
    cached_sec?: number;
    vram_peak_mb?: number;
    cost_first?: number;
    cost_cached?: number;
  };
}

export interface PipelineConfig {
  pipeline: { id: string; name: string; version: string; description: string };
  style: { default: StylePreset; presets: StylePreset[] };
  resolution: { default: ResolutionOption; options: ResolutionOption[] };
  video_settings: { frames: number; fps: number; duration_sec: number; cfg: number; steps: number };
  stages: PipelineStageConfig[];
  performance_baselines: Record<string, number>;
  ops_rules: string[];
}

// Ops panel data
export interface OpsStageData {
  stageId: string;
  stageName: string;
  workflow: string;
  nodeCount: number;
  vramMb: number;
  costUsd: number;
  durationSec: number;
  status: PipelineStageStatus;
}
