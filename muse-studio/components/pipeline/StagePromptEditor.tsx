'use client';

import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Image as ImageIcon, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { usePipeline } from './PipelineContext';

// ---------------------------------------------------------------------------
// Mock output paths per stage (used for simulated generation)
// ---------------------------------------------------------------------------
const MOCK_OUTPUTS: Record<string, string> = {
  '1A': '/api/outputs/drafts/character_sketch.png',
  '1B': '/api/outputs/drafts/character_2d_v2.png',
  '2':  '/api/outputs/drafts/first_frame_test.png',
  '3':  '/api/outputs/drafts/last_frame_test.png',
  '4A': '/api/outputs/drafts/first_frame_test.png',
  '4B': '/api/outputs/drafts/last_frame_test.png',
  '5':  '/api/outputs/videos/test_video.mp4',
};

// Maps each stage to the upstream stages it depends on
const UPSTREAM_MAP: Record<string, { stageId: string; label: string }[]> = {
  '1A': [],
  '1B': [{ stageId: '1A', label: 'Character Sketch' }],
  '2':  [{ stageId: '1B', label: 'Character 2D' }],
  '3':  [{ stageId: '1B', label: 'Character 2D' }, { stageId: '2', label: 'First Frame Sketch' }],
  '4A': [{ stageId: '1B', label: 'Character 2D' }, { stageId: '2', label: 'First Frame Sketch' }],
  '4B': [{ stageId: '1B', label: 'Character 2D' }, { stageId: '3', label: 'Last Frame Sketch' }],
  '5':  [{ stageId: '4A', label: 'Final First Frame' }, { stageId: '4B', label: 'Final Last Frame' }],
};

export function StagePromptEditor() {
  const { state, dispatch } = usePipeline();
  const stage = state.stages[state.activeStageId];
  const [localPrompt, setLocalPrompt] = useState(stage.prompt || stage.promptTemplate);

  // Keep local prompt in sync when the active stage changes
  // (we key on activeStageId in the parent AnimatePresence, so this component
  //  remounts when the stage changes — useState initializer is sufficient.)

  const upstreams = UPSTREAM_MAP[stage.id] ?? [];

  const handleGenerate = useCallback(() => {
    // Persist prompt to global state
    dispatch({ type: 'UPDATE_PROMPT', stageId: stage.id, prompt: localPrompt });
    // Start generating
    dispatch({ type: 'START_GENERATING', stageId: stage.id, jobId: `mock-${stage.id}-${Date.now()}` });

    // Mock: complete after 2 seconds
    const outputPath = MOCK_OUTPUTS[stage.id] ?? '/api/outputs/drafts/character_sketch.png';
    setTimeout(() => {
      dispatch({
        type: 'STAGE_COMPLETED',
        stageId: stage.id,
        outputPath,
        durationSec: 2,
        cost: 0.008,
      });
    }, 2000);
  }, [dispatch, stage.id, localPrompt]);

  return (
    <div className="pipeline-glass rounded-xl p-6 space-y-6">
      {/* Section 1: Upstream Inputs */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Upstream Inputs</h3>
        {upstreams.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 italic">
            No references — generating from prompt only
          </p>
        ) : (
          <div className="flex gap-3 flex-wrap">
            {upstreams.map((up, index) => {
              const upstreamStage = state.stages[up.stageId];
              const hasOutput = !!upstreamStage?.outputPath;
              return (
                <motion.div
                  key={up.stageId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2',
                    hasOutput && 'border-muse-emerald/20'
                  )}
                >
                  {/* Thumbnail placeholder */}
                  <div className={cn(
                    'w-10 h-10 rounded-md flex items-center justify-center text-xs',
                    hasOutput
                      ? 'bg-muse-emerald/10 text-muse-emerald'
                      : 'bg-white/5 text-muted-foreground/40'
                  )}>
                    {upstreamStage?.kind === 'video' ? (
                      <Film className="size-4" />
                    ) : (
                      <ImageIcon className="size-4" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-foreground/80">
                      {up.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50">
                      {hasOutput ? 'Ready' : 'Pending'}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Prompt Textarea */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Prompt</h3>
        <Textarea
          value={localPrompt}
          onChange={(e) => setLocalPrompt(e.target.value)}
          rows={5}
          className={cn(
            'font-mono text-sm bg-black/40 border-white/5',
            'focus-visible:ring-muse-purple/30 focus-visible:border-muse-purple/40',
            'resize-y min-h-[120px]'
          )}
          placeholder="Describe what this stage should generate..."
        />
        <div className="flex items-center gap-2 mt-2">
          {stage.styleApplied && (
            <Badge variant="secondary" className="text-[10px] bg-muse-purple/10 text-muse-purple border-muse-purple/20">
              Style Applied
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] bg-white/5 text-muted-foreground border-white/5">
            {stage.kind === 'video' ? 'Video' : 'Image'}
          </Badge>
        </div>
      </div>

      {/* Section 3: Action Row */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            onClick={handleGenerate}
            className={cn(
              'bg-gradient-to-r from-muse-purple to-film-gold text-white font-medium',
              'hover:from-muse-purple/90 hover:to-film-gold/90',
              'shadow-lg shadow-muse-purple/20',
              'px-6'
            )}
          >
            <Sparkles className="size-4" />
            Generate
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
