'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  X,
  Loader2,
  Sparkles,
  RotateCcw,
  Play,
  Lock,
  ImageIcon,
  Film,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { PipelineStageStatus, StageKind } from '@/types/pipeline';

// ---------------------------------------------------------------------------
// Node data shape passed from PipelinePageClient
// ---------------------------------------------------------------------------
export interface PipelineStageNodeData {
  stageId: string;
  name: string;
  status: PipelineStageStatus;
  kind: StageKind;
  outputPath?: string;
  prompt?: string;
  errorMessage?: string;
  styleApplied: boolean;
  pulidEnabled?: boolean;
  onGenerate: () => void;
  onApprove: () => void;
  onRetry: () => void;
  onSelect: () => void;
  [key: string]: unknown;
}

export type PipelineStageNodeType = Node<PipelineStageNodeData, 'pipelineStage'>;

// ---------------------------------------------------------------------------
// Handle configuration per stage
// ---------------------------------------------------------------------------
const HANDLE_CONFIG: Record<string, { left: boolean; right: boolean }> = {
  '1A': { left: false, right: true },
  '1B': { left: true, right: true },
  '2':  { left: true, right: true },
  '3':  { left: true, right: true },
  '4A': { left: true, right: true },
  '4B': { left: true, right: true },
  '5':  { left: true, right: false },
};

// ---------------------------------------------------------------------------
// Status-dependent visual mappings
// ---------------------------------------------------------------------------
const STATUS_GLOW: Record<PipelineStageStatus, string> = {
  locked:     '',
  active:     'pipeline-glow-purple',
  generating: '',
  review:     'pipeline-glow-gold',
  approved:   'pipeline-glow-emerald',
  failed:     'pipeline-glow-red',
};

const STATUS_BORDER: Record<PipelineStageStatus, string> = {
  locked:     'border-white/5',
  active:     'border-muse-purple/40',
  generating: '',
  review:     'border-film-gold/40',
  approved:   'border-muse-emerald/40',
  failed:     'border-red-500/40',
};

const STATUS_BADGE: Record<PipelineStageStatus, string> = {
  locked:     'bg-white/5 text-muted-foreground/50',
  active:     'bg-muse-purple/15 text-muse-purple',
  generating: 'bg-film-gold/15 text-film-gold',
  review:     'bg-film-gold/15 text-film-gold',
  approved:   'bg-muse-emerald/15 text-muse-emerald',
  failed:     'bg-red-500/15 text-red-400',
};

// ---------------------------------------------------------------------------
// Sub-components for each status body
// ---------------------------------------------------------------------------

function LockedBody() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 opacity-50">
      <Lock className="size-8 text-muted-foreground/30" />
      <p className="text-[11px] text-muted-foreground/40 text-center px-4">
        Complete previous stages
      </p>
    </div>
  );
}

function ActiveBody({
  prompt,
  styleApplied,
  onGenerate,
}: {
  prompt?: string;
  styleApplied: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Prompt preview */}
      {prompt && (
        <p className="text-[11px] text-muted-foreground/60 font-mono leading-relaxed line-clamp-3">
          {prompt.length > 80 ? `${prompt.slice(0, 80)}...` : prompt}
        </p>
      )}

      {/* Style badge */}
      {styleApplied && (
        <div className="flex">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muse-purple/10 text-muse-purple border border-muse-purple/20">
            Style Applied
          </span>
        </div>
      )}

      {/* Generate button */}
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onGenerate();
          }}
          className={cn(
            'w-full gap-2',
            'bg-gradient-to-r from-muse-purple to-muse-purple/80 text-white',
            'hover:from-muse-purple/90 hover:to-muse-purple/70',
            'shadow-lg shadow-muse-purple/20',
          )}
          size="sm"
        >
          <Sparkles className="size-3.5" />
          Generate
        </Button>
      </motion.div>
    </div>
  );
}

function GeneratingBody() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 pipeline-shimmer rounded-b-xl">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
      >
        <Loader2 className="size-8 text-film-gold" />
      </motion.div>
      <p className="text-xs text-film-gold/80 font-medium">Generating...</p>
    </div>
  );
}

function ReviewBody({
  stageId,
  outputPath,
  kind,
  onApprove,
  onRetry,
}: {
  stageId: string;
  outputPath: string;
  kind: StageKind;
  onApprove: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Output preview with blur-to-sharp reveal */}
      <div className="relative overflow-hidden rounded-lg">
        {kind === 'image' ? (
          <motion.div
            key={`${stageId}-${outputPath}`}
            initial={{ filter: 'blur(12px)', opacity: 0, scale: 1.04 }}
            animate={{ filter: 'blur(0px)', opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={outputPath}
              alt={`Stage ${stageId} output`}
              className="w-full h-[120px] object-cover rounded-lg"
            />
          </motion.div>
        ) : (
          <motion.div
            key={`${stageId}-${outputPath}`}
            initial={{ filter: 'blur(12px)', opacity: 0, scale: 1.04 }}
            animate={{ filter: 'blur(0px)', opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="relative"
          >
            <video
              src={outputPath}
              muted
              playsInline
              className="w-full h-[120px] object-cover rounded-lg"
            />
            {/* Play icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="size-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                <Play className="size-4 text-white ml-0.5" />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Action buttons */}
      <motion.div
        className="flex items-center gap-2"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      >
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onApprove();
          }}
          size="sm"
          className="flex-1 gap-1.5 bg-muse-emerald hover:bg-muse-emerald/90 text-white text-xs h-8"
        >
          <Check className="size-3" />
          Approve
        </Button>
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          size="sm"
          variant="ghost"
          className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3" />
        </Button>
      </motion.div>
    </div>
  );
}

function ApprovedBody({
  stageId,
  outputPath,
}: {
  stageId: string;
  outputPath?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3">
      {/* Small thumbnail */}
      {outputPath && (
        <motion.div
          initial={{ filter: 'blur(8px)', opacity: 0 }}
          animate={{ filter: 'blur(0px)', opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="shrink-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={outputPath}
            alt={`Stage ${stageId} approved`}
            className="w-[80px] h-[80px] object-cover rounded-lg"
          />
        </motion.div>
      )}

      {/* Approved badge */}
      <div className="flex flex-col items-center gap-1.5 flex-1">
        <div className="size-8 rounded-full bg-muse-emerald/15 flex items-center justify-center">
          <Check className="size-4 text-muse-emerald" />
        </div>
        <span className="text-[10px] text-muse-emerald font-medium">Approved</span>
      </div>
    </div>
  );
}

function FailedBody({
  errorMessage,
  onRetry,
}: {
  errorMessage?: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-2">
        <X className="size-4 text-red-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-red-300/80 leading-relaxed line-clamp-2">
          {errorMessage || 'Generation failed'}
        </p>
      </div>
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          size="sm"
          variant="ghost"
          className="w-full gap-2 text-xs border border-red-500/20 hover:bg-red-500/10 hover:text-red-300"
        >
          <RotateCcw className="size-3" />
          Retry
        </Button>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main node component
// ---------------------------------------------------------------------------
function PipelineStageNodeComponent({ data, selected }: NodeProps<PipelineStageNodeType>) {
  const {
    stageId,
    name,
    status,
    kind,
    outputPath,
    prompt,
    errorMessage,
    styleApplied,
    onGenerate,
    onApprove,
    onRetry,
    onSelect,
  } = data;

  const handles = HANDLE_CONFIG[stageId] ?? { left: true, right: true };
  const isGenerating = status === 'generating';
  const isLocked = status === 'locked';

  return (
    <div
      className={cn(
        'w-[280px] rounded-xl transition-all duration-300',
        // Generating uses the animated conic-gradient border wrapper
        isGenerating && 'pipeline-generating-border',
        // All other states get the glass base with a colored border
        !isGenerating && 'pipeline-glass',
        !isGenerating && STATUS_BORDER[status],
        !isGenerating && 'border',
        STATUS_GLOW[status],
        selected && !isGenerating && 'ring-2 ring-muse-purple/70',
      )}
      onClick={onSelect}
    >
      {/* Inner wrapper — required for generating border to clip content correctly */}
      <div
        className={cn(
          'rounded-xl overflow-hidden',
          isGenerating && 'pipeline-glass',
        )}
      >
        {/* ----------------------------------------------------------------- */}
        {/* Header                                                             */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/5">
          {/* Stage ID badge */}
          <span
            className={cn(
              'text-[10px] font-bold font-mono px-2 py-0.5 rounded-md',
              STATUS_BADGE[status],
            )}
          >
            {stageId}
          </span>

          {/* Stage name */}
          <span
            className={cn(
              'text-xs font-medium truncate flex-1',
              isLocked ? 'text-muted-foreground/40' : 'text-foreground/80',
            )}
          >
            {name}
          </span>

          {/* PuLID identity badge */}
          {data.pulidEnabled && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30">
              <User className="w-2.5 h-2.5" />
              ID
            </span>
          )}

          {/* Kind icon */}
          {kind === 'video' ? (
            <Film
              className={cn(
                'size-3.5 shrink-0',
                isLocked ? 'text-muted-foreground/25' : 'text-film-gold/60',
              )}
            />
          ) : (
            <ImageIcon
              className={cn(
                'size-3.5 shrink-0',
                isLocked ? 'text-muted-foreground/25' : 'text-muse-purple/60',
              )}
            />
          )}
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Body — status-dependent content with animated transitions          */}
        {/* ----------------------------------------------------------------- */}
        <AnimatePresence mode="wait">
          <motion.div
            key={status}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {status === 'locked' && <LockedBody />}

            {status === 'active' && (
              <ActiveBody
                prompt={prompt}
                styleApplied={styleApplied}
                onGenerate={onGenerate}
              />
            )}

            {status === 'generating' && <GeneratingBody />}

            {status === 'review' && outputPath && (
              <ReviewBody
                stageId={stageId}
                outputPath={outputPath}
                kind={kind}
                onApprove={onApprove}
                onRetry={onRetry}
              />
            )}

            {status === 'approved' && (
              <ApprovedBody stageId={stageId} outputPath={outputPath} />
            )}

            {status === 'failed' && (
              <FailedBody errorMessage={errorMessage} onRetry={onRetry} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Handles (connection points)                                          */}
      {/* ------------------------------------------------------------------- */}
      {handles.left && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(
            '!w-3 !h-3 !rounded-full !border-2 !-left-[7px]',
            '!bg-black/80 !border-white/20',
            'hover:!border-muse-purple/60 hover:!shadow-[0_0_10px_oklch(0.606_0.259_290.79/0.4)]',
            'transition-all duration-200',
          )}
        />
      )}

      {handles.right && (
        <Handle
          type="source"
          position={Position.Right}
          className={cn(
            '!w-3 !h-3 !rounded-full !border-2 !-right-[7px]',
            '!bg-black/80 !border-white/20',
            'hover:!border-muse-emerald/60 hover:!shadow-[0_0_10px_oklch(0.696_0.17_162.48/0.4)]',
            'transition-all duration-200',
          )}
        />
      )}
    </div>
  );
}

export const PipelineStageNode = memo(PipelineStageNodeComponent);
