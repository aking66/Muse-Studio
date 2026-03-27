export { openRouterOptionalHeaders } from '@/lib/generation/openRouterHeaders';

export const MAX_SCENES_PER_REQUEST = 24;

/** Manual storylines can be huge; oversized prompts slow or overload local LLMs. Full text stays in DB. */
export const MAX_SCENE_PROMPT_PLOT_CHARS = 26_000;
export const MAX_SCENE_PROMPT_CHAR_BLOCK_CHARS = 3_200;
export const MAX_SCENE_PROMPT_LOGLINE_CHARS = 1_600;
export const MAX_SCENE_PROMPT_THEMES_CHARS = 2_000;

export function clipForScenePrompt(text: string, max: number, note: string): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[${note}]`;
}

export function buildSceneSystemPrompt(targetScenes: number): string {
  const n = Math.max(1, Math.floor(targetScenes));
  return `You are Story Muse, a professional screenplay writer.

Given a film storyline, generate approximately ${n} scene scripts that faithfully adapt the full story arc: setup, rising action, midpoint, climax, and resolution.

CRITICAL: Format each scene using EXACTLY this structure. Use <<<SCENE>>> and <<<END>>> as delimiters — nothing else:

<<<SCENE>>>
SCENE_NUM: 1
TITLE: The exact scene title
HEADING: INT./EXT. LOCATION NAME — TIME OF DAY
DESCRIPTION: 2–4 sentences of vivid visual description — what happens, atmosphere, character actions, emotional beats.
DIALOGUE: CHARACTER_NAME: (optional stage direction) Dialogue line.
ANOTHER_CHARACTER: Response line.
NOTES: Brief cinematography / lighting / technical notes.
<<<END>>>

You must generate AT LEAST ${n - 1 > 0 ? `${n - 1}` : '1'} scenes and AT MOST ${n + 2} scenes. Do NOT add any text or commentary outside the <<<SCENE>>> blocks.`;
}

const encoder = new TextEncoder();

export function sseNamedEvent(eventName: string, data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function sseKeepAlive(): Uint8Array {
  return encoder.encode(': ping\n\n');
}

export function newSceneId(): string {
  return `scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface ParsedScene {
  sceneNumber: number;
  title: string;
  heading: string;
  description: string;
  dialogue: string;
  technicalNotes: string;
}

export function extractField(block: string, fieldName: string): string {
  const regex = new RegExp(
    `^${fieldName}:\\s*([\\s\\S]*?)(?=^[A-Z_]+:|$)`,
    'im',
  );
  return (block.match(regex)?.[1] ?? '').trim();
}

export function parseSceneBlock(block: string, fallbackNumber: number): ParsedScene | null {
  const title = extractField(block, 'TITLE');
  const heading = extractField(block, 'HEADING');
  const description = extractField(block, 'DESCRIPTION');
  if (!title || !heading || !description) return null;

  const rawNum = extractField(block, 'SCENE_NUM') || extractField(block, 'NUMBER');
  const sceneNumber = parseInt(rawNum) || fallbackNumber;
  const dialogue = extractField(block, 'DIALOGUE');
  const technicalNotes = extractField(block, 'NOTES');

  return { sceneNumber, title, heading, description, dialogue, technicalNotes };
}

export async function* generateOllamaText(opts: {
  baseUrl: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  numPredict?: number;
  timeoutMs?: number;
}): AsyncGenerator<string> {
  const cleanUrl = opts.baseUrl.replace(/\/+$/, '');
  const numPredict = opts.numPredict ?? 8000;
  const timeoutMs = opts.timeoutMs ?? 20 * 60 * 1000;

  let res: globalThis.Response;
  try {
    res = await fetch(`${cleanUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: opts.userMessage },
        ],
        stream: true,
        options: { temperature: 0.75, num_predict: numPredict },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const msg =
      err instanceof Error && err.name === 'TimeoutError'
        ? `Ollama timed out (${Math.round(timeoutMs / 60000)} min). Try fewer scenes or a faster model.`
        : `Cannot connect to Ollama at ${cleanUrl}. Is it running?`;
    throw new Error(msg);
  }

  if (!res.ok) {
    let bodySnippet = '';
    try {
      bodySnippet = (await res.text()).trim().slice(0, 280);
    } catch {
      /* ignore */
    }
    if (res.status === 429) {
      throw new Error(
        'Ollama returned 429 (too many requests). The GPU is busy, another tab is generating, or limits are tight — wait a minute, stop parallel runs, then retry.',
      );
    }
    throw new Error(`Ollama HTTP ${res.status}${bodySnippet ? ` — ${bodySnippet}` : ''}`);
  }

  if (!res.body) throw new Error('Ollama returned no response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
        const text = j.message?.content ?? '';
        if (text) yield text;
      } catch {
        /* skip */
      }
    }
  }
}

export async function* generateOpenAICompatText(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  providerName?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
  missingKeyHint?: string;
}): AsyncGenerator<string> {
  const cleanBase = opts.baseUrl.replace(/\/+$/, '');
  const keyHint =
    opts.missingKeyHint ?? 'Set the key in muse-studio/.env.local and restart the dev server.';
  if (!opts.apiKey) {
    throw new Error(`${opts.providerName ?? 'API'} key not configured. ${keyHint}`);
  }

  const maxTokens = opts.maxOutputTokens ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  let res: globalThis.Response;
  try {
    res = await fetch(`${cleanBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
        ...(cleanBase.includes('anthropic') && { 'anthropic-version': '2023-06-01' }),
        ...opts.extraHeaders,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: opts.userMessage },
        ],
        max_tokens: maxTokens,
        temperature: 0.75,
        stream: true,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error(`Cannot connect to ${opts.providerName ?? 'API'}.`);
  }

  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`;
    try {
      detail =
        ((await res.clone().json()) as { error?: { message?: string } })?.error?.message ?? detail;
    } catch {
      /**/
    }
    throw new Error(`${opts.providerName ?? 'API'} error: ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const j = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
        const text = j.choices?.[0]?.delta?.content ?? '';
        if (text) yield text;
      } catch {
        /* skip */
      }
    }
  }
}

export async function* generateLMStudioText(opts: {
  baseUrl: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): AsyncGenerator<string> {
  const cleanUrl = opts.baseUrl.replace(/\/+$/, '');
  const maxTokens = opts.maxOutputTokens ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  let res: globalThis.Response;
  try {
    res = await fetch(`${cleanUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: opts.userMessage },
        ],
        max_tokens: maxTokens,
        temperature: 0.75,
        stream: true,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error(`Cannot connect to LM Studio at ${cleanUrl}.`);
  }

  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`;
    try {
      detail =
        ((await res.clone().json()) as { error?: { message?: string } })?.error?.message ?? detail;
    } catch {
      /**/
    }
    throw new Error(`LM Studio error: ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const j = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const text = j.choices?.[0]?.delta?.content ?? '';
        if (text) yield text;
      } catch {
        /* skip */
      }
    }
  }
}
