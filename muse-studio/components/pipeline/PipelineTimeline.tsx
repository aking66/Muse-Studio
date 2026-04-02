'use client';

import { motion, AnimatePresence } from 'motion/react';
import { Check, X, Loader2, Film, DollarSign, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePipeline } from './PipelineContext';
import type { PipelineStageStatus } from '@/types/pipeline';

// ---------------------------------------------------------------------------
// Status icon — animated transitions between states
// ---------------------------------------------------------------------------
function StageStatusIcon({ status }: { status: PipelineStageStatus }) {
  return (
    <AnimatePresence mode="wait">
      {status === 'approved' && (
        <motion.div
          key="check"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </motion.div>
      )}
      {status === 'failed' && (
        <motion.div
          key="fail"
          initial={{ x: 0 }}
          animate={{ x: [0, -3, 3, -2, 2, 0] }}
          exit={{ scale: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <X className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </motion.div>
      )}
      {status === 'generating' && (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <Loader2 className="h-2.5 w-2.5 animate-spin text-white" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Format seconds into Xm Xs
// ---------------------------------------------------------------------------
function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ---------------------------------------------------------------------------
// PipelineTimeline — left sidebar vertical stage tracker
// ---------------------------------------------------------------------------
export default function PipelineTimeline() {
  const { state, dispatch } = usePipeline();
  const { stages, stageOrder, activeStageId, totalCost, totalTimeSec } = state;

  return (
    <div className="pipeline-glass flex h-full w-[280px] flex-col rounded-xl">
      {/* Header */}
      <div className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-film-gold" />
          <h2 className="pipeline-gradient-text text-sm font-semibold tracking-wide">
            Production Stages
          </h2>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative flex-1 overflow-y-auto px-5 py-4">
        {/* Vertical connector line */}
        <div
          className="pipeline-timeline-line"
          style={{ top: 18, bottom: 18 }}
        />

        <div className="flex flex-col gap-1">
          {stageOrder.map((id) => {
            const stage = stages[id];
            const isActive = id === activeStageId;
            const hasOutput = !!stage.outputPath;

            return (
              <motion.button
                key={id}
                layout
                onClick={() => dispatch({ type: 'SET_ACTIVE_STAGE', stageId: id })}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                  'hover:bg-white/[0.03]',
                  isActive && 'border-l-2 border-muse-purple bg-white/[0.04]',
                  !isActive && 'border-l-2 border-transparent',
                  stage.status === 'locked' && 'opacity-40',
                )}
              >
                {/* Status dot */}
                <div className="relative z-10 flex-shrink-0">
                  <div
                    className={cn(
                      'pipeline-stage-dot relative',
                      `pipeline-stage-dot-${stage.status}`,
                      isActive && stage.status === 'active' && 'pipeline-pulse-glow',
                    )}
                  >
                    <StageStatusIcon status={stage.status} />
                  </div>
                </div>

                {/* Stage info */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      'truncate text-xs font-medium',
                      isActive ? 'text-white' : 'text-white/60',
                    )}
                  >
                    {stage.id}. {stage.name}
                  </span>
                  {stage.kind === 'video' && (
                    <span className="text-[10px] text-film-gold/70">video</span>
                  )}
                </div>

                {/* Thumbnail for approved/review stages with output */}
                <AnimatePresence>
                  {hasOutput && (stage.status === 'approved' || stage.status === 'review') && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="flex-shrink-0"
                    >
                      <div className="h-[30px] w-[40px] overflow-hidden rounded border border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={stage.outputPath}
                          alt={stage.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Bottom: Cost + Time summary */}
      <div className="border-t border-white/5 px-5 py-4">
        <div className="pipeline-glass flex flex-col gap-2 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5 text-film-gold" />
              <span className="text-[10px] uppercase tracking-widest text-white/40">
                Total Cost
              </span>
            </div>
            <span className="font-mono text-sm font-semibold text-film-gold">
              ${totalCost.toFixed(3)}
            </span>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-white/50" />
              <span className="text-[10px] uppercase tracking-widest text-white/40">
                Elapsed
              </span>
            </div>
            <span className="font-mono text-sm text-white/50">
              {formatTime(totalTimeSec)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
