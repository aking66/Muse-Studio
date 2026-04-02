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
  Pencil,
  UserCircle,
  Frame,
  Wand2,
  Clapperboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { PipelineStageStatus, StageKind, StageHandle } from '@/types/pipeline';

// ---------------------------------------------------------------------------
// Handle color mapping by data type
// ---------------------------------------------------------------------------
const HANDLE_COLORS: Record<StageHandle['type'], string> = {
  image: 'oklch(0.606 0.259 290.79)',   // purple
  text:  'oklch(0.769 0.188 70.08)',     // gold
  video: 'oklch(0.696 0.17 162.48)',     // emerald
};

// ---------------------------------------------------------------------------
// Per-stage handle definitions
// ---------------------------------------------------------------------------
export const STAGE_HANDLES: Record<string, { inputs: StageHandle[]; outputs: StageHandle[] }> = {
  '1A': {
    inputs: [
      { id: 'prompt', label: 'Prompt', type: 'text', position: 'input' },
    ],
    outputs: [
      { id: 'character_sketch', label: 'Character Sketch', type: 'image', position: 'output' },
    ],
  },
  '1B': {
    inputs: [
      { id: 'prompt', label: 'Prompt', type: 'text', position: 'input' },
    ],
    outputs: [
      { id: 'character_2d', label: 'Character 2D', type: 'image', position: 'output' },
    ],
  },
  '2': {
    inputs: [
      { id: 'prompt', label: 'Prompt', type: 'text', position: 'input' },
      { id: 'identity', label: 'PuLID Identity', type: 'image', position: 'input' },
    ],
    outputs: [
      { id: 'first_frame_sketch', label: 'First Frame Sketch', type: 'image', position: 'output' },
    ],
  },
  '3': {
    inputs: [
      { id: 'prompt', label: 'Prompt', type: 'text', position: 'input' },
      { id: 'identity', label: 'PuLID Identity', type: 'image', position: 'input' },
      { id: 'style_ref', label: 'Style Reference', type: 'image', position: 'input' },
    ],
    outputs: [
      { id: 'last_frame_sketch', label: 'Last Frame Sketch', type: 'image', position: 'output' },
    ],
  },
  '4A': {
    inputs: [
      { id: 'scene_sketch', label: 'Scene Sketch', type: 'image', position: 'input' },
      { id: 'character_ref', label: 'Character Ref', type: 'image', position: 'input' },
      { id: 'location_ref', label: 'Location Ref', type: 'image', position: 'input' },
      { id: 'prompt', label: 'Prompt', type: 'text', position: 'input' },
      { id: 'identity', label: 'PuLID Identity', type: 'image', position: 'input' },
    ],
    outputs: [
      { id: 'first_frame_final', label: 'First Frame Final', type: 'image', position: 'output' },
    ],
  },
  '4B': {
    inputs: [
      { id: 'scene_sketch', label: 'Scene Sketch', type: 'image', position: 'input' },
      { id: 'character_ref', label: 'Character Ref', type: 'image', position: 'input' },
      { id: 'location_ref', label: 'Location Ref', type: 'image', position: 'input' },
      { id: 'prompt', label: 'Prompt', type: 'text', position: 'input' },
      { id: 'identity', label: 'PuLID Identity', type: 'image', position: 'input' },
    ],
    outputs: [
      { id: 'last_frame_final', label: 'Last Frame Final', type: 'image', position: 'output' },
    ],
  },
  '5': {
    inputs: [
      { id: 'first_frame', label: 'First Frame', type: 'image', position: 'input' },
      { id: 'last_frame', label: 'Last Frame', type: 'image', position: 'input' },
      { id: 'positive_prompt', label: 'Positive Prompt', type: 'text', position: 'input' },
      { id: 'negative_prompt', label: 'Negative Prompt', type: 'text', position: 'input' },
    ],
    outputs: [
      { id: 'video', label: 'Video', type: 'video', position: 'output' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Node data shape passed from PipelinePageClient
// ---------------------------------------------------------------------------
export interface PipelineStageNodeData {
  stageId: string;
  name: string;
  status: PipelineStageStatus;
  kind: StageKind;
  inputs: StageHandle[];
  outputs: StageHandle[];
  outputPath?: string;
  prompt?: string;
  errorMessage?: string;
  styleApplied: boolean;
  pulidEnabled?: boolean;
  cost?: number;
  durationSec?: number;
  onGenerate: () => void;
  onApprove: () => void;
  onRetry: () => void;
  onSelect: () => void;
  [key: string]: unknown;
}

export type PipelineStageNodeType = Node<PipelineStageNodeData, 'pipelineStage'>;

// ---------------------------------------------------------------------------
// Status-dependent visual mappings
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Node type visual identity — icon, color, accent per stage
// ---------------------------------------------------------------------------
const NODE_TYPE_CONFIG: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  category: string;
}> = {
  '1A': {
    icon: Pencil,
    accentColor: 'text-gray-400',
    accentBg: 'bg-gray-500/10',
    accentBorder: 'border-gray-500/20',
    category: 'Sketch',
  },
  '1B': {
    icon: UserCircle,
    accentColor: 'text-violet-400',
    accentBg: 'bg-violet-500/10',
    accentBorder: 'border-violet-500/20',
    category: 'Character',
  },
  '2': {
    icon: Frame,
    accentColor: 'text-blue-400',
    accentBg: 'bg-blue-500/10',
    accentBorder: 'border-blue-500/20',
    category: 'Frame',
  },
  '3': {
    icon: Frame,
    accentColor: 'text-blue-400',
    accentBg: 'bg-blue-500/10',
    accentBorder: 'border-blue-500/20',
    category: 'Frame',
  },
  '4A': {
    icon: Wand2,
    accentColor: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
    accentBorder: 'border-amber-500/20',
    category: 'Final',
  },
  '4B': {
    icon: Wand2,
    accentColor: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
    accentBorder: 'border-amber-500/20',
    category: 'Final',
  },
  '5': {
    icon: Clapperboard,
    accentColor: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10',
    accentBorder: 'border-emerald-500/20',
    category: 'Video',
  },
};

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
// Handle label row component
// ---------------------------------------------------------------------------
function HandleLabel({ handle }: { handle: StageHandle }) {
  return (
    <div className="flex items-center gap-1.5 h-5">
      <div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: HANDLE_COLORS[handle.type] }}
      />
      <span className="text-[10px] text-white/50 leading-none truncate">
        {handle.label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components for each status body (compact versions)
// ---------------------------------------------------------------------------

function LockedBody() {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-4 opacity-50">
      <Lock className="size-5 text-muted-foreground/30" />
      <p className="text-[10px] text-muted-foreground/40 text-center">
        Locked
      </p>
    </div>
  );
}

function ActiveBody({
  prompt,
  onGenerate,
}: {
  prompt?: string;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 py-2">
      {prompt && (
        <p className="text-[10px] text-muted-foreground/50 font-mono leading-relaxed line-clamp-2">
          {prompt.length > 60 ? `${prompt.slice(0, 60)}...` : prompt}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muse-purple/80 font-medium">Ready</span>
        <div className="flex-1" />
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onGenerate();
            }}
            className={cn(
              'gap-1 h-6 px-2.5 text-[10px]',
              'bg-gradient-to-r from-muse-purple to-muse-purple/80 text-white',
              'hover:from-muse-purple/90 hover:to-muse-purple/70',
              'shadow-lg shadow-muse-purple/20',
            )}
            size="sm"
          >
            <Sparkles className="size-2.5" />
            Generate
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

function GeneratingBody() {
  return (
    <div className="flex items-center justify-center gap-2 py-4 pipeline-shimmer rounded-lg">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
      >
        <Loader2 className="size-5 text-film-gold" />
      </motion.div>
      <p className="text-[10px] text-film-gold/80 font-medium">Generating...</p>
    </div>
  );
}

function ReviewBody({
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
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-2 px-1">
        <div className="size-5 rounded-full bg-film-gold/15 flex items-center justify-center">
          <Check className="size-2.5 text-film-gold" />
        </div>
        <span className="text-[10px] text-film-gold/80 font-medium">Ready for review</span>
      </div>

      <motion.div
        className="flex items-center gap-1.5"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onApprove();
          }}
          size="sm"
          className="flex-1 gap-1 bg-muse-emerald hover:bg-muse-emerald/90 text-white text-[10px] h-6"
        >
          <Check className="size-2.5" />
          Approve
        </Button>
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          size="sm"
          variant="ghost"
          className="gap-1 text-[10px] h-6 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-2.5" />
        </Button>
      </motion.div>
    </div>
  );
}

function ApprovedBody({
  cost,
  durationSec,
}: {
  stageId: string;
  outputPath?: string;
  cost?: number;
  durationSec?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <div className="flex items-center gap-2 flex-1">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          <div className="size-6 rounded-full bg-muse-emerald/15 flex items-center justify-center">
            <Check className="size-3 text-muse-emerald" />
          </div>
        </motion.div>
        <span className="text-[10px] text-muse-emerald/80 font-medium">Approved</span>
        {(cost != null || durationSec != null) && (
          <span className="text-[9px] text-white/30 font-mono ml-auto">
            {cost != null && `$${cost.toFixed(3)}`}
            {cost != null && durationSec != null && ' · '}
            {durationSec != null && `${durationSec}s`}
          </span>
        )}
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
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-start gap-1.5">
        <X className="size-3 text-red-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-red-300/80 leading-relaxed line-clamp-2">
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
          className="w-full gap-1.5 text-[10px] h-6 border border-red-500/20 hover:bg-red-500/10 hover:text-red-300"
        >
          <RotateCcw className="size-2.5" />
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
    inputs,
    outputs,
    outputPath,
    prompt,
    errorMessage,
    styleApplied,
    cost,
    durationSec,
    pulidEnabled,
    onGenerate,
    onApprove,
    onRetry,
    onSelect,
  } = data;

  const isGenerating = status === 'generating';
  const isLocked = status === 'locked';

  // Calculate minimum height based on handle count
  const maxHandles = Math.max(inputs.length, outputs.length, 1);
  // Each handle row is 20px (h-5), plus header (~40px) and body area (~min 80px)
  const handleAreaHeight = maxHandles * 20;

  return (
    <div
      className={cn(
        'w-[300px] rounded-xl transition-all duration-300',
        isGenerating && 'pipeline-generating-border',
        !isGenerating && 'pipeline-glass',
        !isGenerating && STATUS_BORDER[status],
        !isGenerating && 'border',
        STATUS_GLOW[status],
        selected && !isGenerating && 'ring-2 ring-muse-purple/70',
      )}
      onClick={onSelect}
    >
      {/* Inner wrapper for generating border clip */}
      <div
        className={cn(
          'rounded-xl overflow-hidden',
          isGenerating && 'pipeline-glass',
        )}
      >
        {/* ----------------------------------------------------------------- */}
        {/* Header                                                             */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5">
          {/* Node type icon + ID badge */}
          {(() => {
            const nodeType = NODE_TYPE_CONFIG[stageId];
            const Icon = nodeType?.icon || ImageIcon;
            return (
              <div className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-lg shrink-0',
                nodeType?.accentBg || 'bg-white/5',
                nodeType?.accentBorder || 'border-white/10',
                'border',
              )}>
                <Icon className={cn('size-3', nodeType?.accentColor || 'text-white/50')} />
                <span className={cn('text-[10px] font-bold font-mono', nodeType?.accentColor || 'text-white/50')}>
                  {stageId}
                </span>
              </div>
            );
          })()}

          {/* Stage name */}
          <span
            className={cn(
              'text-[11px] font-medium truncate flex-1',
              isLocked ? 'text-muted-foreground/40' : 'text-foreground/80',
            )}
          >
            {name}
          </span>

          {/* PuLID identity badge */}
          {pulidEnabled && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30 shrink-0">
              <User className="w-2 h-2" />
              ID
            </span>
          )}

          {/* Kind icon */}
          {kind === 'video' ? (
            <Film
              className={cn(
                'size-3 shrink-0',
                isLocked ? 'text-muted-foreground/25' : 'text-film-gold/60',
              )}
            />
          ) : (
            <ImageIcon
              className={cn(
                'size-3 shrink-0',
                isLocked ? 'text-muted-foreground/25' : 'text-muse-purple/60',
              )}
            />
          )}
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Body: handle labels + status content side by side                  */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex" style={{ minHeight: Math.max(handleAreaHeight, 80) }}>
          {/* Left: input labels */}
          <div className="flex flex-col justify-center gap-0 py-2 pl-3 pr-1 shrink-0 w-[100px]">
            {inputs.map((handle) => (
              <HandleLabel key={handle.id} handle={handle} />
            ))}
          </div>

          {/* Center: status body */}
          <div className="flex-1 px-2 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={status}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="h-full flex flex-col justify-center"
              >
                {status === 'locked' && <LockedBody />}

                {status === 'active' && (
                  <ActiveBody prompt={prompt} onGenerate={onGenerate} />
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
                  <ApprovedBody
                    stageId={stageId}
                    outputPath={outputPath}
                    cost={cost}
                    durationSec={durationSec}
                  />
                )}

                {status === 'failed' && (
                  <FailedBody errorMessage={errorMessage} onRetry={onRetry} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right: output labels */}
          <div className="flex flex-col justify-center gap-0 py-2 pr-3 pl-1 shrink-0 w-[100px]">
            {outputs.map((handle) => (
              <div key={handle.id} className="flex items-center justify-end gap-1.5 h-5">
                <span className="text-[10px] text-white/50 leading-none truncate text-right">
                  {handle.label}
                </span>
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: HANDLE_COLORS[handle.type] }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Input Handles (left side, positioned to align with labels)           */}
      {/* ------------------------------------------------------------------- */}
      {inputs.map((handle, i) => {
        // Header is ~40px, then each handle label is 20px (h-5), centered in that row
        // The handle area starts after the header, and we center each handle in its row
        const headerHeight = 40;
        const handleRowHeight = 20;
        const handleAreaTop = headerHeight;
        const totalHandleAreaHeight = Math.max(inputs.length * handleRowHeight, 80);
        // Center handles vertically within the handle area
        const offsetY = (totalHandleAreaHeight - inputs.length * handleRowHeight) / 2;
        const yPos = handleAreaTop + offsetY + i * handleRowHeight + handleRowHeight / 2;

        return (
          <Handle
            key={`in-${handle.id}`}
            type="target"
            position={Position.Left}
            id={`${stageId}-${handle.id}`}
            style={{
              top: yPos,
              background: HANDLE_COLORS[handle.type],
              width: 8,
              height: 8,
              border: '2px solid oklch(0.15 0.01 264)',
              left: -4,
            }}
          />
        );
      })}

      {/* ------------------------------------------------------------------- */}
      {/* Output Handles (right side, positioned to align with labels)         */}
      {/* ------------------------------------------------------------------- */}
      {outputs.map((handle, i) => {
        const headerHeight = 40;
        const handleRowHeight = 20;
        const handleAreaTop = headerHeight;
        const totalHandleAreaHeight = Math.max(outputs.length * handleRowHeight, 80);
        const offsetY = (totalHandleAreaHeight - outputs.length * handleRowHeight) / 2;
        const yPos = handleAreaTop + offsetY + i * handleRowHeight + handleRowHeight / 2;

        return (
          <Handle
            key={`out-${handle.id}`}
            type="source"
            position={Position.Right}
            id={`${stageId}-${handle.id}`}
            style={{
              top: yPos,
              background: HANDLE_COLORS[handle.type],
              width: 8,
              height: 8,
              border: '2px solid oklch(0.15 0.01 264)',
              right: -4,
            }}
          />
        );
      })}
    </div>
  );
}

export const PipelineStageNode = memo(PipelineStageNodeComponent);
