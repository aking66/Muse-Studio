'use client';

import { useState, useCallback } from 'react';
import type { VideoGenerateResponse, JobResult } from '@/lib/backend-client';
import { JOB_POLL_INTERVAL_MS } from '@/lib/jobs/jobPolling';
import { useSingleJobPoll } from '@/hooks/useJobPoll';

export interface VideoOptions {
  sceneId: string;
  script: string;
  keyframePaths?: string[];
  durationSeconds?: number;
  fps?: number;
  motionStrength?: number;
  providerId?: string;
}

export type MotionMusePhase = 'idle' | 'queued' | 'running' | 'completed' | 'failed';

export interface MotionMuseState {
  phase: MotionMusePhase;
  jobId: string | null;
  providerId: string | null;
  progressPercent: number;
  message: string | null;
  outputPath: string | null;
  error: string | null;
}

/**
 * Manages Motion Muse async video generation:
 *   1. submitJob() → POST /api/generate/video — gets a job_id immediately
 *   2. Polls GET /api/jobs/[id] on a long interval until completed or failed
 */
export function useMotionMuse() {
  const [state, setState] = useState<MotionMuseState>({
    phase: 'idle',
    jobId: null,
    providerId: null,
    progressPercent: 0,
    message: null,
    outputPath: null,
    error: null,
  });

  const { start: startPolling, stop: stopPolling } = useSingleJobPoll({
    intervalMs: JOB_POLL_INTERVAL_MS.motionMuse,
    requireOutputPath: false,
    onCompleted: (job: JobResult) => {
      setState((prev) => ({
        ...prev,
        phase: 'completed',
        progressPercent: 100,
        message: job.message ?? 'Generation complete',
        outputPath: job.output_path ?? null,
      }));
    },
    onFailed: (job: JobResult) => {
      setState((prev) => ({
        ...prev,
        phase: 'failed',
        error: job.error ?? 'Video generation failed',
      }));
    },
    onRunning: (job: JobResult) => {
      setState((prev) => ({
        ...prev,
        phase: job.status === 'running' ? 'running' : 'queued',
        progressPercent: job.progress_percent ?? prev.progressPercent,
        message: job.message ?? prev.message,
      }));
    },
  });

  const submitJob = useCallback(
    async (opts: VideoOptions) => {
      stopPolling();
      setState({
        phase: 'queued',
        jobId: null,
        providerId: null,
        progressPercent: 0,
        message: 'Submitting job…',
        outputPath: null,
        error: null,
      });

      try {
        const res = await fetch('/api/generate/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scene_id: opts.sceneId,
            script: opts.script,
            keyframe_paths: opts.keyframePaths ?? [],
            duration_seconds: opts.durationSeconds,
            fps: opts.fps,
            motion_strength: opts.motionStrength ?? 0.7,
            provider_id: opts.providerId,
          }),
        });

        if (!res.ok) {
          const body = await res.json();
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }

        const data = (await res.json()) as VideoGenerateResponse;
        setState((prev) => ({
          ...prev,
          jobId: data.job_id,
          providerId: data.provider_id,
          message: data.message,
        }));
        startPolling(data.job_id);
        return data.job_id;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Video job submission failed';
        setState((prev) => ({ ...prev, phase: 'failed', error: message }));
        return null;
      }
    },
    [stopPolling, startPolling],
  );

  const reset = useCallback(() => {
    stopPolling();
    setState({
      phase: 'idle',
      jobId: null,
      providerId: null,
      progressPercent: 0,
      message: null,
      outputPath: null,
      error: null,
    });
  }, [stopPolling]);

  return { ...state, submitJob, reset };
}
