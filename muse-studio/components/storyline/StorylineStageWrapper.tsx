'use client';

import { useRouter } from 'next/navigation';
import { StorylineStage } from './StorylineStage';
import { confirmStoryline } from '@/lib/actions/projects';
import type { LLMSettings } from '@/lib/actions/settings';
import type { Project, StorylineContent } from '@/lib/types';

interface StorylineStageWrapperProps {
  project: Project;
  llmSettings?: LLMSettings;
}

export function StorylineStageWrapper({ project, llmSettings }: StorylineStageWrapperProps) {
  const router = useRouter();

  async function handleConfirm(
    storyline: StorylineContent,
    options?: { targetScenes: number; storylineSource?: 'MANUAL' | 'MUSE_GENERATED' },
  ) {
    // Save storyline to DB and advance project stage to SCRIPT
    await confirmStoryline(project.id, storyline, {
      storylineSource: options?.storylineSource,
    });

    // Manual storyline: land on Kanban so the user writes scenes themselves — no auto LLM run.
    if (options?.storylineSource === 'MANUAL') {
      router.push(`/projects/${project.id}`);
      return;
    }

    // Story Muse storyline: open scene-generation overlay (avoids revalidatePath race)
    const params = new URLSearchParams({ generating: 'scenes' });
    const targetScenes = options?.targetScenes;
    if (targetScenes && Number.isFinite(targetScenes)) {
      params.set('targetScenes', String(targetScenes));
    }
    router.push(`/projects/${project.id}?${params.toString()}`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <StorylineStage project={project} onConfirm={handleConfirm} llmSettings={llmSettings} />
    </div>
  );
}
