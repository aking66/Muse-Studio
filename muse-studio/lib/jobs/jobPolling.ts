import type { JobResult } from '@/lib/backend-client';

/** Shared intervals for GET /api/jobs/[id] polling (keep UX + load predictable). */
export const JOB_POLL_INTERVAL_MS = {
  /** Comfy / plugin dialogs & playground */
  fast: 2500,
  /** Kanban background polling for long video jobs */
  background: 60_000,
  /** Motion Muse long-running video — reduce backend chatter */
  motionMuse: 3 * 60 * 1000,
} as const;

export type FetchJobApiResult =
  | { ok: true; job: JobResult }
  | { ok: false; status: number; job: null };

/**
 * Fetch a single job status from the Next.js proxy (browser-safe).
 */
export async function fetchJobFromApi(jobId: string): Promise<FetchJobApiResult> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) {
    return { ok: false, status: res.status, job: null };
  }
  const job = (await res.json()) as JobResult;
  return { ok: true, job };
}
