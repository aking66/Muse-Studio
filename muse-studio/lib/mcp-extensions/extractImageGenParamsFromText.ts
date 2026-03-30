/**
 * When the Extensions chat LLM returns only { prompt }, recover width/height/steps/seed
 * from natural language (e.g. "width 1280, height 720, using 15 steps").
 */

export type ExtractedImageGenParams = {
  width?: number;
  height?: number;
  numInferenceSteps?: number;
  seed?: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function extractImageGenParamsFromText(text: string): ExtractedImageGenParams {
  const out: ExtractedImageGenParams = {};

  const wh = text.match(/\b(\d{3,4})\s*[x×]\s*(\d{3,4})\b/i);
  if (wh) {
    out.width = clamp(parseInt(wh[1], 10), 256, 4096);
    out.height = clamp(parseInt(wh[2], 10), 256, 4096);
  }

  const mw = text.match(/\bwidth\s*[:=]?\s*(\d{3,4})\b/i);
  if (mw) out.width = clamp(parseInt(mw[1], 10), 256, 4096);

  const mh = text.match(/\bheight\s*[:=]?\s*(\d{3,4})\b/i);
  if (mh) out.height = clamp(parseInt(mh[1], 10), 256, 4096);

  // "using 15 steps", "15 steps", "steps: 15", "steps 15"
  const st =
    text.match(/\busing\s+(\d{1,2})\s+steps\b/i) ||
    text.match(/\b(\d{1,2})\s+steps\b/i) ||
    text.match(/\bsteps\s*[:=]\s*(\d{1,2})\b/i);
  if (st) {
    const s = parseInt(st[1], 10);
    if (s >= 1 && s <= 50) out.numInferenceSteps = s;
  }

  const sd = text.match(/\bseed\s*[:=]?\s*(\d+)\b/i);
  if (sd) out.seed = parseInt(sd[1], 10);

  return out;
}
