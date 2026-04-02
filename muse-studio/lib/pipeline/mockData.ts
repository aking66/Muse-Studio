import type { PipelineState, PipelineStageState, StylePreset } from '@/types/pipeline';

const STAGE_ORDER = ['1A', '1B', '2', '3', '4A', '4B', '5'];

const MOCK_STAGES: Record<string, PipelineStageState> = {
  '1A': {
    id: '1A',
    name: 'Character Sketch',
    status: 'approved',
    kind: 'image',
    prompt: 'character sketch, rough line art, small orange fox, blue scarf around neck, big curious eyes, fluffy tail with white tip, front view, 3/4 view, side view, pencil sketch style, white background',
    promptTemplate: 'character sketch, rough line art, {character.description}, front view, 3/4 view, side view, pencil sketch style, white background',
    styleApplied: false,
    outputPath: '/api/outputs/drafts/character_sketch.png',
    durationSec: 212,
    cost: 0.050,
    completedAt: Date.now() - 300000,
  },
  '1B': {
    id: '1B',
    name: 'Character 2D',
    status: 'review',
    kind: 'image',
    prompt: 'character sheet, small cute orange fox with blue scarf, big curious eyes, fluffy tail with white tip, front view, 3/4 view, side view, 2D flat vector animation style, Rick and Morty art style, bold black outlines, simple cel-shading, vibrant solid colors, high contrast, adult animation aesthetic, white background',
    promptTemplate: 'character sheet, {character.description}, front view, 3/4 view, side view, {style.keywords}, white background',
    styleApplied: true,
    outputPath: '/api/outputs/drafts/character_2d_v2.png',
    durationSec: 35,
    cost: 0.008,
    completedAt: Date.now() - 240000,
  },
  '2': {
    id: '2',
    name: 'First Frame Sketch',
    status: 'active',
    kind: 'image',
    prompt: '',
    promptTemplate: 'scene sketch, rough line art, {character.name} {shot.first_frame_action} in {shot.location}, {shot.camera_angle}, pencil sketch style, composition reference, clear proportions',
    styleApplied: false,
  },
  '3': {
    id: '3',
    name: 'Last Frame Sketch',
    status: 'locked',
    kind: 'image',
    prompt: '',
    promptTemplate: 'scene sketch, rough line art, {character.name} {shot.last_frame_action} in {shot.location}, {shot.camera_angle}, pencil sketch style, same background as reference',
    styleApplied: false,
  },
  '4A': {
    id: '4A',
    name: 'Final First Frame',
    status: 'locked',
    kind: 'image',
    prompt: '',
    promptTemplate: '{character.name} {shot.first_frame_action}, {shot.background_description}, {style.keywords}, {shot.lighting}',
    styleApplied: true,
  },
  '4B': {
    id: '4B',
    name: 'Final Last Frame',
    status: 'locked',
    kind: 'image',
    prompt: '',
    promptTemplate: '{character.name} {shot.last_frame_action}, {shot.background_description}, {style.keywords}, {shot.lighting}',
    styleApplied: true,
  },
  '5': {
    id: '5',
    name: 'Video',
    status: 'locked',
    kind: 'video',
    prompt: '',
    promptTemplate: '{character.name} {shot.motion_description}, smooth motion, {style.keywords}, consistent character proportions, fluid animation',
    styleApplied: true,
  },
};

export const MOCK_STYLE: StylePreset = {
  id: 'rick-and-morty',
  name: 'Rick and Morty',
  keywords: '2D flat vector animation style, Rick and Morty art style, bold black outlines, simple cel-shading, vibrant solid colors, clean minimalist backgrounds, high contrast, adult animation aesthetic',
  negative: '3D render, realistic, blurry, distorted, deformed, low quality, sketch, pencil lines',
};

export const MOCK_PIPELINE_STATE: PipelineState = {
  projectId: 'proj-mndjag4e-t7urc',
  projectTitle: '2D Animation Pipeline Test',
  characterName: 'Kito',
  characterDescription: 'small orange fox, blue scarf around neck, big curious eyes, fluffy tail with white tip',
  stylePresetId: 'rick-and-morty',
  styleKeywords: MOCK_STYLE.keywords,
  styleNegative: MOCK_STYLE.negative,
  resolution: { width: 832, height: 480, aspect: '16:9', label: 'Standard Widescreen' },
  stages: MOCK_STAGES,
  stageOrder: STAGE_ORDER,
  activeStageId: '1B',
  totalCost: 0.058,
  totalTimeSec: 247,
  isRunning: false,
  opsExpanded: false,
};

// Mock ops data for the debug panel
export const MOCK_OPS_DATA = [
  { stageId: '1A', stageName: 'Character Sketch', workflow: 'flux2-sketch-to-image-api.json', nodeCount: 17, vramMb: 30000, costUsd: 0.050, durationSec: 212, status: 'approved' as const },
  { stageId: '1B', stageName: 'Character 2D', workflow: 'flux2-ref-to-image-api.json', nodeCount: 21, vramMb: 30000, costUsd: 0.008, durationSec: 35, status: 'review' as const },
  { stageId: '2', stageName: 'First Frame Sketch', workflow: 'flux2-ref-to-image-api.json', nodeCount: 21, vramMb: 30000, costUsd: 0, durationSec: 0, status: 'active' as const },
  { stageId: '3', stageName: 'Last Frame Sketch', workflow: 'flux2-ref-to-image-api.json', nodeCount: 21, vramMb: 30000, costUsd: 0, durationSec: 0, status: 'locked' as const },
  { stageId: '4A', stageName: 'Final First Frame', workflow: 'flux2-multiref-scene-api.json', nodeCount: 19, vramMb: 30000, costUsd: 0, durationSec: 0, status: 'locked' as const },
  { stageId: '4B', stageName: 'Final Last Frame', workflow: 'flux2-multiref-scene-api.json', nodeCount: 19, vramMb: 30000, costUsd: 0, durationSec: 0, status: 'locked' as const },
  { stageId: '5', stageName: 'Video', workflow: 'wan22-flf2v-api.json', nodeCount: 12, vramMb: 36069, costUsd: 0, durationSec: 0, status: 'locked' as const },
];
