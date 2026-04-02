'use client';

import { motion, AnimatePresence } from 'motion/react';
import { ChevronUp, ChevronDown, Terminal, Cpu, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { usePipeline } from './PipelineContext';
import { MOCK_OPS_DATA } from '@/lib/pipeline/mockData';
import type { PipelineStageStatus } from '@/types/pipeline';

// Status color map for badges
const STATUS_STYLES: Record<PipelineStageStatus, string> = {
  locked:     'bg-white/10 text-white/40',
  active:     'bg-muse-purple/20 text-muse-purple',
  generating: 'bg-film-gold/20 text-film-gold',
  review:     'bg-film-gold/20 text-film-gold',
  approved:   'bg-muse-emerald/20 text-muse-emerald',
  failed:     'bg-destructive/20 text-destructive',
};

function formatCost(usd: number): string {
  if (usd === 0) return '-';
  return `$${usd.toFixed(3)}`;
}

function formatTime(sec: number): string {
  if (sec === 0) return '-';
  return `${sec.toFixed(1)}s`;
}

export function PipelineOpsPanel() {
  const { state, dispatch } = usePipeline();
  const { opsExpanded, totalCost, totalTimeSec, activeStageId } = state;

  const toggle = () => dispatch({ type: 'TOGGLE_OPS' });

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10">
      {/* Collapsed bar — always visible */}
      <button
        onClick={toggle}
        className={cn(
          'flex w-full items-center justify-between px-4 h-10',
          'pipeline-glass cursor-pointer',
          'hover:bg-white/5 transition-colors',
        )}
      >
        {/* Left side */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Terminal className="size-4" />
          <span className="font-medium">Agent View</span>
        </div>

        {/* Right side — quick stats */}
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
            <DollarSign className="size-3" />
            {totalCost.toFixed(3)}
          </span>
          <span className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
            {formatTime(totalTimeSec)}
          </span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {activeStageId}
          </Badge>
          {opsExpanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {opsExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 300, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="overflow-hidden pipeline-glass"
          >
            <div className="h-[300px] overflow-auto px-4 py-3">
              {/* Header badges */}
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Cpu className="size-3" />
                  GPU: A100
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  VRAM: 80 GB
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  ~$0.80/hr
                </Badge>
              </div>

              {/* Stages table */}
              <div className="rounded-lg border border-white/5 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">Stage</th>
                      <th className="text-left px-3 py-2 font-medium">Workflow</th>
                      <th className="text-right px-3 py-2 font-medium">Nodes</th>
                      <th className="text-right px-3 py-2 font-medium">VRAM (MB)</th>
                      <th className="text-right px-3 py-2 font-medium">Cost ($)</th>
                      <th className="text-right px-3 py-2 font-medium">Time (s)</th>
                      <th className="text-center px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_OPS_DATA.map((row, i) => (
                      <tr
                        key={row.stageId}
                        className={cn(
                          'border-b border-white/[0.03]',
                          i % 2 === 1 && 'bg-white/[0.02]',
                        )}
                      >
                        <td className="px-3 py-2 font-medium text-foreground">
                          {row.stageId} - {row.stageName}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[200px]">
                          {row.workflow}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{row.nodeCount}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {row.vramMb.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatCost(row.costUsd)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatTime(row.durationSec)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge
                            className={cn(
                              'text-[10px] px-1.5 py-0 border-0 capitalize',
                              STATUS_STYLES[row.status],
                            )}
                          >
                            {row.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals row */}
              <div className="flex items-center justify-end gap-6 mt-2 px-3 text-xs text-muted-foreground">
                <span>
                  Total cost: <span className="font-mono text-foreground">{formatCost(totalCost)}</span>
                </span>
                <span>
                  Total time: <span className="font-mono text-foreground">{formatTime(totalTimeSec)}</span>
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
