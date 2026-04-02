import fs from 'fs';
import path from 'path';
import { notFound } from 'next/navigation';
import { getProjectById } from '@/lib/actions/projects';
import { PipelinePageClient } from '@/components/pipeline/PipelinePageClient';
import { MOCK_PIPELINE_STATE } from '@/lib/pipeline/mockData';
import type { PipelineState, PipelineStageState } from '@/types/pipeline';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Try to load the latest run file for this project.
 * Falls back to mock data if no run file exists.
 */
function loadRunState(projectId: string): PipelineState | null {
  try {
    const runsDir = path.join(process.cwd(), '..', 'pipeline-config', 'runs');
    if (!fs.existsSync(runsDir)) return null;

    const files = fs.readdirSync(runsDir).filter(f => f.endsWith('.json')).sort().reverse();

    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(runsDir, file), 'utf-8'));
      if (raw.project_id === projectId) {
        // Convert run file format → PipelineState
        const stageOrder = ['1A', '1B', '2', '3', '4A', '4B', '5'];
        const stageNames: Record<string, string> = {
          '1A': 'Character Sketch', '1B': 'Character 2D',
          '2': 'First Frame Sketch', '3': 'Last Frame Sketch',
          '4A': 'Final First Frame', '4B': 'Final Last Frame',
          '5': 'Video',
        };
        const stageKinds: Record<string, 'image' | 'video'> = {
          '1A': 'image', '1B': 'image', '2': 'image', '3': 'image',
          '4A': 'image', '4B': 'image', '5': 'video',
        };
        const styleApplied: Record<string, boolean> = {
          '1A': false, '1B': true, '2': false, '3': false,
          '4A': true, '4B': true, '5': true,
        };

        const stages: Record<string, PipelineStageState> = {};
        for (const id of stageOrder) {
          const rs = raw.stages?.[id] || {};
          stages[id] = {
            id,
            name: stageNames[id],
            status: rs.status || 'locked',
            kind: stageKinds[id],
            prompt: rs.prompt || '',
            promptTemplate: '',
            styleApplied: styleApplied[id],
            outputPath: rs.output_path ? `/api/outputs/${rs.output_path}` : undefined,
            jobId: rs.job_id,
            durationSec: rs.duration_sec,
            cost: rs.cost,
            startedAt: rs.started_at ? new Date(rs.started_at).getTime() : undefined,
            completedAt: rs.completed_at ? new Date(rs.completed_at).getTime() : undefined,
          };
        }

        return {
          projectId: raw.project_id,
          projectTitle: raw.project_title,
          characterName: raw.character?.name || '',
          characterDescription: raw.character?.description || '',
          stylePresetId: raw.style?.preset_id || 'default',
          styleKeywords: raw.style?.keywords || '',
          styleNegative: raw.style?.negative || '',
          resolution: raw.resolution || { width: 832, height: 480, aspect: '16:9', label: 'Standard Widescreen' },
          stages,
          stageOrder,
          activeStageId: raw.active_stage || '1A',
          totalCost: raw.total_cost || 0,
          totalTimeSec: raw.total_time_sec || 0,
          isRunning: raw.is_running || false,
          opsExpanded: false,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export default async function PipelinePage({ params }: PageProps) {
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) notFound();

  // Try loading from run file, fallback to mock
  const runState = loadRunState(project.id);
  const initialState = runState || {
    ...MOCK_PIPELINE_STATE,
    projectId: project.id,
    projectTitle: project.title,
  };

  return (
    <div className="h-screen bg-[oklch(0.09_0.015_264)] overflow-hidden">
      <PipelinePageClient initialState={initialState} />
    </div>
  );
}
