/** Optional OpenRouter HTTP headers from env (used by story + scenes LLM routes). */
export function openRouterOptionalHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (referer) h['HTTP-Referer'] = referer;
  if (title) h['X-Title'] = title;
  return h;
}
