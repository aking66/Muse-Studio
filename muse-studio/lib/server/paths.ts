import path from 'path';

/** Absolute path to the repo `outputs/` directory (cwd = muse-studio app root). */
export function getOutputsRoot(): string {
  return path.join(process.cwd(), 'outputs');
}

export function toPosixPath(rel: string): string {
  return rel.split(path.sep).join('/');
}

export function assertRelativePathNoTraversal(rel: string): void {
  const parts = toPosixPath(rel).split('/').filter(Boolean);
  if (parts.some((p) => p === '..')) throw new Error('Invalid path');
}

/**
 * Resolve a relative path under `outputs/` to an absolute path, or throw if it escapes the root.
 */
export function resolveUnderOutputs(rel: string): string {
  const n = toPosixPath(rel.trim());
  assertRelativePathNoTraversal(n);
  const outputsRoot = path.resolve(getOutputsRoot());
  const abs = path.resolve(path.join(outputsRoot, ...n.split('/')));
  if (!abs.startsWith(outputsRoot)) {
    throw new Error('Path escapes outputs root');
  }
  return abs;
}

/**
 * Normalize stored paths that may be `/api/outputs/...`, full URLs, or plain relative paths.
 * Returns a posix relative path under outputs, or null.
 */
export function normalizeStoredOutputsReference(value: string | null): string | null {
  if (!value) return null;
  let rel = value.trim();
  if (!rel) return null;

  const prefix = '/api/outputs/';
  const idx = rel.indexOf(prefix);
  if (idx !== -1) {
    rel = rel.slice(idx + prefix.length);
  }

  if (rel.startsWith('http://') || rel.startsWith('https://')) {
    try {
      const url = new URL(rel);
      const p = url.pathname;
      const pIdx = p.indexOf(prefix);
      if (pIdx !== -1) {
        rel = p.slice(pIdx + prefix.length);
      }
    } catch {
      // use raw rel
    }
  }

  rel = rel.replace(/^[/\\]+/, '').replace(/\\/g, '/');
  return rel || null;
}
