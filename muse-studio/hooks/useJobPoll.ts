'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { JobResult } from '@/lib/backend-client';
import { fetchJobFromApi } from '@/lib/jobs/jobPolling';

export type UseSingleJobPollOptions = {
  intervalMs: number;
  /**
   * When true (default), `onCompleted` runs only if `job.output_path` is set.
   * Set false for flows that only need `status === 'completed'`.
   */
  requireOutputPath?: boolean;
  onCompleted: (job: JobResult) => void;
  onFailed: (job: JobResult) => void;
  /** Optional progress while queued / running */
  onRunning?: (job: JobResult) => void;
};

/**
 * Polls GET /api/jobs/[id] on a fixed interval until completed or failed.
 * Cleans up the interval on unmount.
 */
export function useSingleJobPoll(options: UseSingleJobPollOptions) {
  const optsRef = useRef(options);
  optsRef.current = options;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(
    (jobId: string) => {
      stop();
      const intervalMs = optsRef.current.intervalMs;
      intervalRef.current = setInterval(async () => {
        try {
          const r = await fetchJobFromApi(jobId);
          if (!r.ok || !r.job) return;
          const job = r.job;
          const { requireOutputPath = true, onCompleted, onFailed, onRunning } = optsRef.current;

          if (job.status === 'completed') {
            if (requireOutputPath && !job.output_path) return;
            stop();
            onCompleted(job);
            return;
          }
          if (job.status === 'failed') {
            stop();
            onFailed(job);
            return;
          }
          onRunning?.(job);
        } catch {
          /* transient network error — keep polling */
        }
      }, intervalMs);
    },
    [stop],
  );

  useEffect(() => () => stop(), [stop]);

  return { start, stop };
}
