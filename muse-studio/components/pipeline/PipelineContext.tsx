'use client';

import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { PipelineState, PipelineAction } from '@/types/pipeline';

// ---------------------------------------------------------------------------
// Reducer — handles all pipeline state transitions
// ---------------------------------------------------------------------------
function pipelineReducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case 'SET_STYLE':
      return { ...state, stylePresetId: action.presetId, styleKeywords: action.keywords, styleNegative: action.negative };

    case 'SET_ACTIVE_STAGE':
      return { ...state, activeStageId: action.stageId };

    case 'UPDATE_PROMPT':
      return {
        ...state,
        stages: { ...state.stages, [action.stageId]: { ...state.stages[action.stageId], prompt: action.prompt } },
      };

    case 'START_GENERATING': {
      const stage = state.stages[action.stageId];
      return {
        ...state,
        isRunning: true,
        stages: {
          ...state.stages,
          [action.stageId]: { ...stage, status: 'generating', jobId: action.jobId, startedAt: Date.now(), errorMessage: undefined },
        },
      };
    }

    case 'STAGE_COMPLETED': {
      const stage = state.stages[action.stageId];
      return {
        ...state,
        totalCost: state.totalCost + action.cost,
        totalTimeSec: state.totalTimeSec + action.durationSec,
        stages: {
          ...state.stages,
          [action.stageId]: {
            ...stage,
            status: 'review',
            outputPath: action.outputPath,
            completedAt: Date.now(),
            durationSec: action.durationSec,
            cost: action.cost,
          },
        },
      };
    }

    case 'STAGE_FAILED': {
      const stage = state.stages[action.stageId];
      return {
        ...state,
        isRunning: false,
        stages: {
          ...state.stages,
          [action.stageId]: { ...stage, status: 'failed', errorMessage: action.error },
        },
      };
    }

    case 'APPROVE_STAGE': {
      // Mark current as approved, unlock next stage in order
      const updatedStages = { ...state.stages };
      updatedStages[action.stageId] = { ...updatedStages[action.stageId], status: 'approved' };

      const currentIndex = state.stageOrder.indexOf(action.stageId);
      const nextStageId = state.stageOrder[currentIndex + 1];
      if (nextStageId && updatedStages[nextStageId].status === 'locked') {
        updatedStages[nextStageId] = { ...updatedStages[nextStageId], status: 'active' };
      }

      return {
        ...state,
        isRunning: false,
        stages: updatedStages,
        activeStageId: nextStageId || action.stageId,
      };
    }

    case 'RETRY_STAGE': {
      const stage = state.stages[action.stageId];
      return {
        ...state,
        stages: {
          ...state.stages,
          [action.stageId]: { ...stage, status: 'active', outputPath: undefined, errorMessage: undefined, jobId: undefined },
        },
      };
    }

    case 'TOGGLE_OPS':
      return { ...state, opsExpanded: !state.opsExpanded };

    case 'RESET_PIPELINE': {
      const resetStages = { ...state.stages };
      state.stageOrder.forEach((id, i) => {
        resetStages[id] = {
          ...resetStages[id],
          status: i === 0 ? 'active' : 'locked',
          outputPath: undefined,
          jobId: undefined,
          errorMessage: undefined,
        };
      });
      return { ...state, stages: resetStages, activeStageId: state.stageOrder[0], totalCost: 0, totalTimeSec: 0, isRunning: false };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context + Provider + Hook
// ---------------------------------------------------------------------------
interface PipelineContextValue {
  state: PipelineState;
  dispatch: React.Dispatch<PipelineAction>;
}

const PipelineContext = createContext<PipelineContextValue | null>(null);

export function PipelineProvider({ initialState, children }: { initialState: PipelineState; children: ReactNode }) {
  const [state, dispatch] = useReducer(pipelineReducer, initialState);
  return (
    <PipelineContext.Provider value={{ state, dispatch }}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline() {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error('usePipeline must be used within PipelineProvider');
  return ctx;
}
