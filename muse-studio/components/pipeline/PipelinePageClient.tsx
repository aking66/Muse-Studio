'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { PipelineProvider, usePipeline } from './PipelineContext';
import { PipelineStageNode, type PipelineStageNodeData } from './PipelineStageNode';
import { PipelineOpsPanel } from './PipelineOpsPanel';
import StyleSelector from './StyleSelector';
import type { PipelineState, PipelineStageStatus, StageHandle } from '@/types/pipeline';

// ---------------------------------------------------------------------------
// Custom node type registry
// ---------------------------------------------------------------------------
const nodeTypes = { pipelineStage: PipelineStageNode };

// ---------------------------------------------------------------------------
// Handle definitions per stage — named inputs and outputs
// ---------------------------------------------------------------------------
const STAGE_HANDLES: Record<string, { inputs: StageHandle[]; outputs: StageHandle[] }> = {
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
      { id: 'sketch_ref', label: 'Sketch (composition)', type: 'image', position: 'input' },
      { id: 'prompt', label: 'Prompt', type: 'text', position: 'input' },
    ],
    outputs: [
      { id: 'character_2d', label: 'Character 2D', type: 'image', position: 'output' },
    ],
  },
  '2': {
    inputs: [
      { id: 'char_ref', label: 'Character Ref', type: 'image', position: 'input' },
      { id: 'prompt', label: 'Prompt', type: 'text', position: 'input' },
      { id: 'identity', label: 'PuLID ID', type: 'image', position: 'input' },
    ],
    outputs: [
      { id: 'first_frame', label: 'First Frame', type: 'image', position: 'output' },
    ],
  },
  '3': {
    inputs: [
      { id: 'char_ref', label: 'Character Ref', type: 'image', position: 'input' },
      { id: 'scene_ref', label: 'Scene Ref (Frame 1)', type: 'image', position: 'input' },
      { id: 'prompt', label: 'Prompt', type: 'text', position: 'input' },
      { id: 'identity', label: 'PuLID ID', type: 'image', position: 'input' },
    ],
    outputs: [
      { id: 'last_frame', label: 'Last Frame', type: 'image', position: 'output' },
    ],
  },
  '4A': {
    inputs: [
      { id: 'scene_sketch', label: 'Scene Sketch', type: 'image', position: 'input' },
      { id: 'character_ref', label: 'Character Ref', type: 'image', position: 'input' },
      { id: 'location_ref', label: 'Location Ref', type: 'image', position: 'input' },
      { id: 'prompt', label: 'Prompt', type: 'text', position: 'input' },
      { id: 'identity', label: 'PuLID ID', type: 'image', position: 'input' },
    ],
    outputs: [
      { id: 'first_frame_final', label: 'First Frame', type: 'image', position: 'output' },
    ],
  },
  '4B': {
    inputs: [
      { id: 'scene_sketch', label: 'Scene Sketch', type: 'image', position: 'input' },
      { id: 'character_ref', label: 'Character Ref', type: 'image', position: 'input' },
      { id: 'location_ref', label: 'Location Ref', type: 'image', position: 'input' },
      { id: 'prompt', label: 'Prompt', type: 'text', position: 'input' },
      { id: 'identity', label: 'PuLID ID', type: 'image', position: 'input' },
    ],
    outputs: [
      { id: 'last_frame_final', label: 'Last Frame', type: 'image', position: 'output' },
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
// DAG node positions — adjusted for taller nodes with multiple handles
// ---------------------------------------------------------------------------
const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  '1A': { x: 0,    y: 200 },
  '1B': { x: 400,  y: 200 },
  '2':  { x: 400,  y: 0   },
  '3':  { x: 400,  y: 450 },
  '4A': { x: 800,  y: 0   },
  '4B': { x: 800,  y: 450 },
  '5':  { x: 1200, y: 200 },
};

// ---------------------------------------------------------------------------
// Edge definitions — handle-to-handle connections
// ---------------------------------------------------------------------------
const EDGE_DEFS: {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  label?: string;
}[] = [
  // === 1A sketch → 1B as composition guide ===
  { id: 'e-1A-1B-comp', source: '1A', sourceHandle: '1A-character_sketch', target: '1B', targetHandle: '1B-sketch_ref', label: 'composition' },

  // === 1B character_2d — the central identity asset ===
  // Goes to Stages 2 & 3 as ReferenceLatent (body+style anchor)
  { id: 'e-1B-2-ref',    source: '1B', sourceHandle: '1B-character_2d', target: '2',  targetHandle: '2-char_ref',     label: 'character ref' },
  { id: 'e-1B-3-ref',    source: '1B', sourceHandle: '1B-character_2d', target: '3',  targetHandle: '3-char_ref',     label: 'character ref' },
  // Goes to Stages 4A & 4B as character reference
  { id: 'e-1B-4A-char',  source: '1B', sourceHandle: '1B-character_2d', target: '4A', targetHandle: '4A-character_ref', label: 'character ref' },
  { id: 'e-1B-4B-char',  source: '1B', sourceHandle: '1B-character_2d', target: '4B', targetHandle: '4B-character_ref', label: 'character ref' },
  // Goes to 2, 3, 4A, 4B as PuLID face identity
  { id: 'e-1B-2-pulid',  source: '1B', sourceHandle: '1B-character_2d', target: '2',  targetHandle: '2-identity',     label: 'PuLID ID' },
  { id: 'e-1B-3-pulid',  source: '1B', sourceHandle: '1B-character_2d', target: '3',  targetHandle: '3-identity',     label: 'PuLID ID' },
  { id: 'e-1B-4A-pulid', source: '1B', sourceHandle: '1B-character_2d', target: '4A', targetHandle: '4A-identity',    label: 'PuLID ID' },
  { id: 'e-1B-4B-pulid', source: '1B', sourceHandle: '1B-character_2d', target: '4B', targetHandle: '4B-identity',    label: 'PuLID ID' },

  // === Stage 2 first_frame — feeds into Stage 3 + 4A ===
  { id: 'e-2-3-scene',   source: '2', sourceHandle: '2-first_frame',    target: '3',  targetHandle: '3-scene_ref',     label: 'scene continuity' },
  { id: 'e-2-4A-scene',  source: '2', sourceHandle: '2-first_frame',    target: '4A', targetHandle: '4A-scene_sketch',  label: 'scene ref' },

  // === Stage 3 last_frame — feeds into 4B ===
  { id: 'e-3-4B-scene',  source: '3', sourceHandle: '3-last_frame',     target: '4B', targetHandle: '4B-scene_sketch',  label: 'scene ref' },

  // === 4A, 4B final frames → Video ===
  { id: 'e-4A-5-first',  source: '4A', sourceHandle: '4A-first_frame_final', target: '5', targetHandle: '5-first_frame', label: 'first frame' },
  { id: 'e-4B-5-last',   source: '4B', sourceHandle: '4B-last_frame_final',  target: '5', targetHandle: '5-last_frame',  label: 'last frame' },
];

// ---------------------------------------------------------------------------
// Edge color by data type
// ---------------------------------------------------------------------------
const EDGE_TYPE_COLORS: Record<string, string> = {
  image: 'oklch(0.606 0.259 290.79)',  // purple
  text:  'oklch(0.769 0.188 70.08)',    // gold
  video: 'oklch(0.696 0.17 162.48)',    // emerald
  pulid: 'oklch(0.55 0.2 290)',         // violet (PuLID specific)
};

function getEdgeDataType(label?: string): string {
  if (!label) return 'image';
  if (label.includes('PuLID')) return 'pulid';
  if (label.includes('prompt') || label.includes('Prompt')) return 'text';
  if (label.includes('video') || label.includes('Video')) return 'video';
  return 'image';
}

// ---------------------------------------------------------------------------
// Edge color based on source+target status (dim override when inactive)
// ---------------------------------------------------------------------------
function getEdgeColor(
  sourceStatus: PipelineStageStatus,
  targetStatus: PipelineStageStatus,
  dataType: string,
): string {
  if (sourceStatus === 'approved' && targetStatus === 'approved') {
    return 'oklch(0.696 0.17 162.48)'; // emerald — completed path
  }
  if (
    sourceStatus === 'approved' &&
    (targetStatus === 'active' || targetStatus === 'generating' || targetStatus === 'review')
  ) {
    return EDGE_TYPE_COLORS[dataType] ?? EDGE_TYPE_COLORS.image;
  }
  return 'oklch(0.25 0.01 264)'; // dim
}

function isEdgeAnimated(sourceStatus: PipelineStageStatus, targetStatus: PipelineStageStatus): boolean {
  return (
    sourceStatus === 'approved' &&
    (targetStatus === 'active' || targetStatus === 'generating' || targetStatus === 'review')
  );
}

// ---------------------------------------------------------------------------
// Stages that use PuLID identity preservation
// ---------------------------------------------------------------------------
const PULID_STAGES = new Set(['2', '3', '4A', '4B']);

// ---------------------------------------------------------------------------
// Build initial nodes from pipeline state
// ---------------------------------------------------------------------------
function buildNodes(
  state: PipelineState,
  dispatch: React.Dispatch<import('@/types/pipeline').PipelineAction>,
  onMockGenerate: (stageId: string) => void,
): Node<PipelineStageNodeData>[] {
  return state.stageOrder.map((id) => {
    const stage = state.stages[id];
    return {
      id,
      type: 'pipelineStage' as const,
      position: NODE_POSITIONS[id] ?? { x: 0, y: 0 },
      data: {
        stageId: id,
        name: stage.name,
        status: stage.status,
        kind: stage.kind,
        inputs: STAGE_HANDLES[id]?.inputs ?? [],
        outputs: STAGE_HANDLES[id]?.outputs ?? [],
        outputPath: stage.outputPath,
        prompt: stage.prompt,
        styleApplied: stage.styleApplied,
        pulidEnabled: PULID_STAGES.has(id),
        cost: stage.cost,
        durationSec: stage.durationSec,
        onGenerate: () => onMockGenerate(id),
        onApprove: () => dispatch({ type: 'APPROVE_STAGE', stageId: id }),
        onRetry: () => dispatch({ type: 'RETRY_STAGE', stageId: id }),
        onSelect: () => dispatch({ type: 'SET_ACTIVE_STAGE', stageId: id }),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Build edges from state
// ---------------------------------------------------------------------------
function buildEdges(state: PipelineState): Edge[] {
  return EDGE_DEFS.map((def) => {
    const sourceStatus = state.stages[def.source]?.status ?? 'locked';
    const targetStatus = state.stages[def.target]?.status ?? 'locked';
    const dataType = getEdgeDataType(def.label);
    const color = getEdgeColor(sourceStatus, targetStatus, dataType);
    const animated = isEdgeAnimated(sourceStatus, targetStatus);
    const isPuLID = dataType === 'pulid';

    return {
      id: def.id,
      source: def.source,
      sourceHandle: def.sourceHandle,
      target: def.target,
      targetHandle: def.targetHandle,
      animated,
      label: def.label,
      labelStyle: { fill: 'oklch(0.5 0.01 264)', fontSize: 9, fontWeight: 500 },
      labelBgStyle: { fill: 'oklch(0.1 0.01 264)', fillOpacity: 0.8 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      style: {
        stroke: color,
        strokeWidth: animated ? 2 : 1.5,
        ...(isPuLID ? { strokeDasharray: '5 3' } : {}),
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 16,
        height: 16,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Inner layout — rendered inside PipelineProvider
// ---------------------------------------------------------------------------
function PipelineFlowLayout() {
  const { state, dispatch } = usePipeline();

  // Mock generate: simulate start -> complete after 2s
  const handleMockGenerate = useCallback(
    (stageId: string) => {
      dispatch({ type: 'START_GENERATING', stageId, jobId: `mock-${Date.now()}` });
      setTimeout(() => {
        dispatch({
          type: 'STAGE_COMPLETED',
          stageId,
          outputPath: `/api/outputs/drafts/${stageId}_output.png`,
          durationSec: 2,
          cost: 0.01,
        });
      }, 2000);
    },
    [dispatch],
  );

  // Build initial nodes/edges
  const initialNodes = useMemo(
    () => buildNodes(state, dispatch, handleMockGenerate),
    // Only build once on mount — synced via useEffect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialEdges = useMemo(
    () => buildEdges(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync pipeline state changes into React Flow nodes
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const stage = state.stages[node.id];
        if (!stage) return node;
        return {
          ...node,
          data: {
            ...node.data,
            stageId: stage.id,
            name: stage.name,
            status: stage.status,
            kind: stage.kind,
            inputs: STAGE_HANDLES[stage.id]?.inputs ?? [],
            outputs: STAGE_HANDLES[stage.id]?.outputs ?? [],
            outputPath: stage.outputPath,
            prompt: stage.prompt,
            styleApplied: stage.styleApplied,
            pulidEnabled: PULID_STAGES.has(stage.id),
            cost: stage.cost,
            durationSec: stage.durationSec,
            onGenerate: () => handleMockGenerate(stage.id),
            onApprove: () => dispatch({ type: 'APPROVE_STAGE', stageId: stage.id }),
            onRetry: () => dispatch({ type: 'RETRY_STAGE', stageId: stage.id }),
            onSelect: () => dispatch({ type: 'SET_ACTIVE_STAGE', stageId: stage.id }),
          },
        };
      }),
    );
  }, [state.stages, dispatch, handleMockGenerate, setNodes]);

  // Sync pipeline state changes into React Flow edges
  useEffect(() => {
    setEdges(() => buildEdges(state));
  }, [state.stages, state, setEdges]);

  // Formatted stats
  const cost = state.totalCost.toFixed(3);
  const mins = Math.floor(state.totalTimeSec / 60);
  const secs = state.totalTimeSec % 60;
  const time = `${mins}m ${secs}s`;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <header className="h-14 border-b border-white/5 pipeline-glass flex items-center px-6 gap-3 shrink-0 z-10">
        <div className="w-2 h-2 rounded-full bg-muse-purple" />
        <h1 className="text-sm font-medium text-white/90">Animation Pipeline</h1>
        <span className="text-xs text-white/30">&mdash;</span>
        <span className="text-sm text-white/50">{state.projectTitle}</span>
        <div className="flex-1" />
        <StyleSelector />
        <span className="text-xs text-white/30 font-mono">
          ${cost} &middot; {time}
        </span>
      </header>

      {/* React Flow canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          defaultEdgeOptions={{
            animated: false,
            style: { stroke: 'oklch(0.4 0.01 264)' },
          }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={1.5}
          nodesDraggable
          nodesConnectable={false}
          className="pipeline-flow-canvas"
        >
          <Background color="oklch(0.2 0.01 264)" gap={20} size={1} />
          <Controls className="!bg-black/50 !border-white/10 !rounded-lg [&>button]:!bg-black/50 [&>button]:!border-white/10 [&>button]:!text-white/60 [&>button:hover]:!bg-white/10" />
          <MiniMap
            className="!bg-black/50 !border-white/10 !rounded-lg"
            nodeColor={(n: Node) => {
              const status = (n.data as PipelineStageNodeData)?.status;
              if (status === 'approved') return 'oklch(0.696 0.17 162.48)';
              if (status === 'active' || status === 'generating') return 'oklch(0.606 0.259 290.79)';
              if (status === 'review') return 'oklch(0.769 0.188 70.08)';
              if (status === 'failed') return 'oklch(0.577 0.245 27.33)';
              return 'oklch(0.3 0.01 264)';
            }}
          />
        </ReactFlow>
      </div>

      {/* Ops panel */}
      <PipelineOpsPanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported client entry — wraps layout with context provider
// ---------------------------------------------------------------------------
export function PipelinePageClient({ initialState }: { initialState: PipelineState }) {
  return (
    <PipelineProvider initialState={initialState}>
      <PipelineFlowLayout />
    </PipelineProvider>
  );
}
