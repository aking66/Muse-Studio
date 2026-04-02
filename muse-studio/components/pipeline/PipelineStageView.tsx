'use client';

import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertTriangle, Lock, ArrowRight, RotateCcw, ImageIcon, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePipeline } from './PipelineContext';
import { StagePromptEditor } from './StagePromptEditor';

// ---------------------------------------------------------------------------
// Stage purpose descriptions (inline — avoids server-only config import)
// ---------------------------------------------------------------------------
const STAGE_PURPOSE: Record<string, string> = {
  '1A': 'Generate a rough character sketch from the character description',
  '1B': 'Refine the sketch into a clean 2D character sheet with style applied',
  '2':  'Create a rough sketch of the first frame composition',
  '3':  'Create a rough sketch of the last frame composition',
  '4A': 'Generate the final styled first frame with full detail',
  '4B': 'Generate the final styled last frame with full detail',
  '5':  'Generate video animation from first frame to last frame',
};

// ---------------------------------------------------------------------------
// Generating State — animated border + progress ring + cost ticker
// ---------------------------------------------------------------------------
function GeneratingView({ stageName, startedAt }: { stageName: string; startedAt?: number }) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = startedAt ?? Date.now();
    intervalRef.current = setInterval(() => {
      setElapsed((Date.now() - start) / 1000);
    }, 100);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startedAt]);

  // Cost estimate: ~$0.86/hr = $0.000239/sec
  const costEstimate = elapsed * (0.86 / 3600);

  return (
    <div className="pipeline-generating-border">
      <div className="bg-midnight rounded-xl p-8 flex flex-col items-center justify-center min-h-[320px] pipeline-shimmer relative overflow-hidden">
        {/* Progress ring */}
        <svg className="pipeline-progress-ring size-20 mb-6" viewBox="0 0 80 80">
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke="oklch(0.606 0.259 290.79 / 0.15)"
            strokeWidth="4"
          />
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke="url(#ring-gradient)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="160"
            strokeDashoffset="80"
          />
          <defs>
            <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="oklch(0.606 0.259 290.79)" />
              <stop offset="100%" stopColor="oklch(0.769 0.188 70.08)" />
            </linearGradient>
          </defs>
        </svg>

        <h3 className="text-lg font-semibold text-foreground/90 mb-1">
          Generating {stageName}...
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Pipeline is processing. This may take a moment.
        </p>

        {/* Elapsed + cost ticker */}
        <div className="flex items-center gap-6 text-xs text-muted-foreground/70 font-mono">
          <span>{elapsed.toFixed(1)}s elapsed</span>
          <span className="text-film-gold/80">${costEstimate.toFixed(4)} est. cost</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review State — placeholder for StagePreview (will be built by another agent)
// ---------------------------------------------------------------------------
function ReviewView({ stageId, outputPath, kind }: { stageId: string; outputPath?: string; kind: 'image' | 'video' }) {
  const { dispatch } = usePipeline();

  return (
    <div className="pipeline-glass rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="secondary" className="bg-film-gold/10 text-film-gold border-film-gold/20 text-[10px]">
          Ready for Review
        </Badge>
      </div>

      {/* Output preview area */}
      <div className="rounded-lg bg-black/40 border border-white/5 min-h-[240px] flex items-center justify-center overflow-hidden">
        {outputPath && kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={outputPath}
            alt={`Stage ${stageId} output`}
            className="max-h-[360px] w-auto object-contain"
          />
        ) : outputPath && kind === 'video' ? (
          <video
            src={outputPath}
            controls
            className="max-h-[360px] w-auto"
          />
        ) : (
          <p className="text-sm text-muted-foreground/50 italic">
            Preview not available
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          variant="outline"
          onClick={() => dispatch({ type: 'RETRY_STAGE', stageId })}
          className="border-white/10 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-4" />
          Retry
        </Button>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            onClick={() => dispatch({ type: 'APPROVE_STAGE', stageId })}
            className="bg-muse-emerald text-white hover:bg-muse-emerald/90 shadow-lg shadow-muse-emerald/20"
          >
            <CheckCircle2 className="size-4" />
            Approve
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approved State
// ---------------------------------------------------------------------------
function ApprovedView({ stageId }: { stageId: string }) {
  const { state, dispatch } = usePipeline();
  const currentIndex = state.stageOrder.indexOf(stageId);
  const nextStageId = state.stageOrder[currentIndex + 1];
  const isLastStage = !nextStageId;

  return (
    <div className="pipeline-glass pipeline-glow-emerald rounded-xl p-8 flex flex-col items-center justify-center min-h-[200px]">
      <CheckCircle2 className="size-12 text-muse-emerald mb-4" />
      <h3 className="text-lg font-semibold text-foreground/90 mb-1">Stage Approved</h3>
      <p className="text-sm text-muted-foreground mb-6">
        {isLastStage
          ? 'All stages complete. Your animation pipeline is finished.'
          : 'Output accepted. Ready to proceed to the next stage.'}
      </p>
      {!isLastStage && nextStageId && (
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            onClick={() => dispatch({ type: 'SET_ACTIVE_STAGE', stageId: nextStageId })}
            className="bg-gradient-to-r from-muse-purple to-film-gold text-white"
          >
            Proceed to Next
            <ArrowRight className="size-4" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Failed State
// ---------------------------------------------------------------------------
function FailedView({ stageId, errorMessage }: { stageId: string; errorMessage?: string }) {
  const { dispatch } = usePipeline();

  return (
    <div className="pipeline-glass pipeline-glow-red rounded-xl p-8 flex flex-col items-center justify-center min-h-[200px]">
      <AlertTriangle className="size-12 text-destructive mb-4" />
      <h3 className="text-lg font-semibold text-foreground/90 mb-1">Generation Failed</h3>
      <p className="text-sm text-muted-foreground mb-2 text-center max-w-md">
        {errorMessage || 'An unexpected error occurred during generation.'}
      </p>
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="mt-4">
        <Button
          variant="outline"
          onClick={() => dispatch({ type: 'RETRY_STAGE', stageId })}
          className="border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          <RotateCcw className="size-4" />
          Retry
        </Button>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locked State
// ---------------------------------------------------------------------------
function LockedView() {
  return (
    <div className="pipeline-glass rounded-xl p-8 flex flex-col items-center justify-center min-h-[200px] opacity-60">
      <Lock className="size-12 text-muted-foreground/40 mb-4" />
      <h3 className="text-lg font-semibold text-muted-foreground/60 mb-1">Stage Locked</h3>
      <p className="text-sm text-muted-foreground/40">
        Complete previous stages first to unlock this stage.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component: PipelineStageView
// ---------------------------------------------------------------------------
export function PipelineStageView() {
  const { state } = usePipeline();
  const stage = state.stages[state.activeStageId];

  if (!stage) return null;

  const purpose = STAGE_PURPOSE[stage.id] ?? '';

  return (
    <div className="flex-1 min-w-0">
      {/* Stage Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-2xl font-bold pipeline-gradient-text">
            {stage.name}
          </h2>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] border-white/10',
              stage.kind === 'video'
                ? 'text-film-gold bg-film-gold/5'
                : 'text-muse-purple bg-muse-purple/5'
            )}
          >
            {stage.kind === 'video' ? (
              <><Film className="size-3" /> Video</>
            ) : (
              <><ImageIcon className="size-3" /> Image</>
            )}
          </Badge>
          {stage.styleApplied && (
            <Badge
              variant="outline"
              className="text-[10px] border-muse-emerald/20 text-muse-emerald bg-muse-emerald/5"
            >
              Style
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground/70">{purpose}</p>
      </div>

      {/* Animated stage content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${state.activeStageId}-${stage.status}`}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {stage.status === 'active' && <StagePromptEditor />}
          {stage.status === 'generating' && (
            <GeneratingView stageName={stage.name} startedAt={stage.startedAt} />
          )}
          {stage.status === 'review' && (
            <ReviewView stageId={stage.id} outputPath={stage.outputPath} kind={stage.kind} />
          )}
          {stage.status === 'approved' && <ApprovedView stageId={stage.id} />}
          {stage.status === 'failed' && (
            <FailedView stageId={stage.id} errorMessage={stage.errorMessage} />
          )}
          {stage.status === 'locked' && <LockedView />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
