/** Map a preview URL served via `/api/outputs/...` to the relative path under the outputs root. */
export function previewUrlToOutputsRelPath(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const prefix = '/api/outputs/';
  if (!url.startsWith(prefix)) return null;
  try {
    const noQuery = url.split('?')[0] ?? url;
    const rest = noQuery.slice(prefix.length).replace(/^\/+/, '');
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

export function mediaKindFromRelPath(rel: string): 'image' | 'video' | null {
  const ext = rel.includes('.') ? (rel.split('.').pop() ?? '').toLowerCase() : '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
  return null;
}
