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
import type { PipelineState, PipelineStageStatus } from '@/types/pipeline';

// ---------------------------------------------------------------------------
// Custom node type registry
// ---------------------------------------------------------------------------
const nodeTypes = { pipelineStage: PipelineStageNode };

// ---------------------------------------------------------------------------
// DAG node positions
// ---------------------------------------------------------------------------
const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  '1A': { x: 0,    y: 250 },
  '1B': { x: 350,  y: 250 },
  '2':  { x: 350,  y: 50  },
  '3':  { x: 350,  y: 450 },
  '4A': { x: 700,  y: 50  },
  '4B': { x: 700,  y: 450 },
  '5':  { x: 1050, y: 250 },
};

// ---------------------------------------------------------------------------
// Edge definitions — mirrors pipeline config output_used_by
// ---------------------------------------------------------------------------
const EDGE_DEFS: { id: string; source: string; target: string; label?: string }[] = [
  { id: 'e-1A-1B', source: '1A', target: '1B', label: 'sketch ref' },
  { id: 'e-1A-2',  source: '1A', target: '2',  label: 'sketch ref' },
  { id: 'e-1A-3',  source: '1A', target: '3',  label: 'sketch ref' },
  { id: 'e-1B-4A', source: '1B', target: '4A', label: 'character ref' },
  { id: 'e-1B-4B', source: '1B', target: '4B', label: 'character ref' },
  { id: 'e-2-3',   source: '2',  target: '3',  label: 'style ref' },
  { id: 'e-2-4A',  source: '2',  target: '4A', label: 'scene sketch' },
  { id: 'e-3-4B',  source: '3',  target: '4B', label: 'scene sketch' },
  { id: 'e-4A-5',  source: '4A', target: '5',  label: 'first frame' },
  { id: 'e-4B-5',  source: '4B', target: '5',  label: 'last frame' },
];

// ---------------------------------------------------------------------------
// Edge color based on source+target status
// ---------------------------------------------------------------------------
function getEdgeColor(sourceStatus: PipelineStageStatus, targetStatus: PipelineStageStatus): string {
  if (sourceStatus === 'approved' && targetStatus === 'approved') {
    return 'oklch(0.696 0.17 162.48)'; // emerald — completed path
  }
  if (
    sourceStatus === 'approved' &&
    (targetStatus === 'active' || targetStatus === 'generating' || targetStatus === 'review')
  ) {
    return 'oklch(0.606 0.259 290.79)'; // purple — active path
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
        outputPath: stage.outputPath,
        prompt: stage.prompt,
        styleApplied: stage.styleApplied,
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
    const color = getEdgeColor(sourceStatus, targetStatus);
    const animated = isEdgeAnimated(sourceStatus, targetStatus);

    return {
      id: def.id,
      source: def.source,
      target: def.target,
      animated,
      label: def.label,
      labelStyle: { fill: 'oklch(0.5 0.01 264)', fontSize: 9, fontWeight: 500 },
      labelBgStyle: { fill: 'oklch(0.1 0.01 264)', fillOpacity: 0.8 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      style: { stroke: color, strokeWidth: animated ? 2 : 1.5 },
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
            outputPath: stage.outputPath,
            prompt: stage.prompt,
            styleApplied: stage.styleApplied,
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
