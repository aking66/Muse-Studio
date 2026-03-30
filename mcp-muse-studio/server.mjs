import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';
import Database from 'better-sqlite3';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
// Load `mcp-muse-studio/.env` so `npm run start` picks up MCP_* without manual export.
dotenv.config({ path: path.join(serverDir, '.env') });

const env = process.env;

const PORT = env.MCP_PORT ? Number(env.MCP_PORT) : 3333;
const BIND_HOST = env.MCP_BIND_HOST?.trim() || '127.0.0.1';

// Where Muse Studio Next.js is reachable from this MCP server.
const MUSE_STUDIO_BASE_URL = env.MUSE_STUDIO_BASE_URL?.trim() || 'http://127.0.0.1:3000';

// Canonical muse.db lives in muse-studio/db/muse.db.
const DEFAULT_DB_PATH = path.resolve(serverDir, '..', 'muse-studio', 'db', 'muse.db');
const MUSE_STUDIO_DB_PATH = env.MUSE_STUDIO_DB_PATH?.trim() || DEFAULT_DB_PATH;

const MCP_AUTH_TOKEN = env.MCP_AUTH_TOKEN?.trim() || '';

const parseBool = (v, defaultValue = false) => {
  if (v == null) return defaultValue;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};

const MCP_ALLOW_WRITE = parseBool(env.MCP_ALLOW_WRITE, false);
const MCP_ALLOWED_TOOLS = env.MCP_ALLOWED_TOOLS
  ? env.MCP_ALLOWED_TOOLS.split(',').map((s) => s.trim()).filter(Boolean)
  : null;
const MCP_ALLOWED_PROJECT_IDS = env.MCP_ALLOWED_PROJECT_IDS
  ? env.MCP_ALLOWED_PROJECT_IDS.split(',').map((s) => s.trim()).filter(Boolean)
  : null;

const shouldEnableTool = (toolName) => {
  if (!MCP_ALLOWED_TOOLS) return true;
  return MCP_ALLOWED_TOOLS.includes(toolName);
};

const assertWriteAllowed = ({ projectId }) => {
  if (!MCP_ALLOW_WRITE) {
    throw new Error('Write tools are disabled. Set MCP_ALLOW_WRITE=true to enable side effects.');
  }
  if (!projectId || typeof projectId !== 'string') {
    throw new Error('projectId is required for write operations.');
  }
  if (MCP_ALLOWED_PROJECT_IDS && MCP_ALLOWED_PROJECT_IDS.length > 0) {
    if (!MCP_ALLOWED_PROJECT_IDS.includes(projectId)) {
      throw new Error(`projectId "${projectId}" is not in MCP_ALLOWED_PROJECT_IDS.`);
    }
  }
};

function requireAuth(req, res, next) {
  if (!MCP_AUTH_TOKEN) return next();
  const header = req.headers.authorization || '';
  const m = String(header).match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];
  if (!token || token !== MCP_AUTH_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeStorylineFromRow(row) {
  if (!row?.storyline_plot_outline) return undefined;
  return {
    logline: row.storyline_logline ?? undefined,
    plotOutline: row.storyline_plot_outline,
    characters: row.storyline_characters ? JSON.parse(row.storyline_characters) : [],
    themes: row.storyline_themes ? JSON.parse(row.storyline_themes) : [],
    genre: row.storyline_genre ?? undefined,
  };
}

async function readSseUntilFinal(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    // Not SSE; read as JSON or text and return raw.
    const txt = await response.text();
    return { finalText: txt, done: true };
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('SSE response has no body');

  const decoder = new TextDecoder();
  let buffer = '';
  let finalText = '';
  let isDone = false;
  let lastError = null;

  while (!isDone) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line (\n\n).
    while (true) {
      const sepIdx = buffer.indexOf('\n\n');
      if (sepIdx === -1) break;
      const rawEvent = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);

      const lines = rawEvent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      let eventName = null;
      const dataLines = [];

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice('event:'.length).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).trim());
        }
      }

      if (!dataLines.length) continue;

      const dataStr = dataLines.join('\n');
      let parsed;
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        parsed = { text: dataStr, is_final: false };
      }

      if (parsed?.error) {
        lastError = parsed.error;
      }

      if (typeof parsed?.text === 'string') {
        finalText += parsed.text;
      }

      // Most of our Muse SSE endpoints use `is_final: true` on the last chunk.
      if (parsed?.is_final === true) {
        isDone = true;
        break;
      }

      // Scenes generation uses explicit SSE event names ("done"/"error").
      if (eventName === 'done') {
        isDone = true;
        break;
      }
      if (eventName === 'error') {
        lastError = parsed?.error || 'scene generation error';
        isDone = true;
        break;
      }
    }
  }

  // Best-effort: close the stream early once we already reached the final event.
  if (isDone) {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }

  if (lastError) {
    throw new Error(typeof lastError === 'string' ? lastError : safeJsonStringify(lastError));
  }

  return { finalText, done: true };
}

function openDb() {
  // Keep this separate so each tool invocation gets its own connection lifetime.
  return new Database(MUSE_STUDIO_DB_PATH, { readonly: true });
}

function getRows(db, sql, params = []) {
  return db.prepare(sql).all(...params);
}

function getRow(db, sql, params = []) {
  return db.prepare(sql).get(...params);
}

function mapImageAsset({ id, url, width, height, alt }) {
  return { id, url, width, height, alt };
}

function mapKeyframe({ keyframeId, sequenceOrder, source, status, draft_image_path, final_image_path, prompt, denoise_strength, style_strength, aspect_ratio, created_at, updated_at }) {
  const draft = draft_image_path
    ? { id: `${keyframeId}-draft`, url: `/api/outputs/${draft_image_path}`, width: 0, height: 0 }
    : undefined;
  const final = final_image_path
    ? { id: `${keyframeId}-final`, url: `/api/outputs/${final_image_path}`, width: 0, height: 0 }
    : undefined;

  return {
    keyframeId,
    sequenceOrder,
    source,
    status,
    draftImage: draft,
    finalImage: final,
    referenceImages: [],
    generationParams: {
      prompt: prompt ?? undefined,
      denoiseStrength: denoise_strength ?? undefined,
      styleStrength: style_strength ?? undefined,
      aspectRatio: aspect_ratio ?? undefined,
    },
    createdAt: created_at ? new Date(created_at).toISOString() : undefined,
    updatedAt: updated_at ? new Date(updated_at).toISOString() : undefined,
  };
}

function mapReferenceImages(rows) {
  return rows.map((r) => ({
    id: r.id,
    // Keep consistent with Muse Studio mapping: reference_images.url is stored as a URL/path already.
    url: r.url,
    width: r.width,
    height: r.height,
    alt: r.alt ?? undefined,
  }));
}

function mapSceneRow(sceneRow, keyframes) {
  return {
    id: sceneRow.id,
    sceneNumber: sceneRow.scene_number,
    title: sceneRow.title,
    heading: sceneRow.heading,
    description: sceneRow.description,
    dialogue: sceneRow.dialogue ?? undefined,
    technicalNotes: sceneRow.technical_notes ?? undefined,
    status: sceneRow.status,
    keyframes,
    videoUrl: sceneRow.video_url ?? undefined,
    videoDurationSeconds: sceneRow.video_duration_seconds ?? undefined,
    activeMuse: sceneRow.active_muse ?? undefined,
    comfyImageWorkflowId: sceneRow.comfy_image_workflow_id ?? undefined,
    comfyVideoWorkflowId: sceneRow.comfy_video_workflow_id ?? undefined,
    createdAt: sceneRow.created_at ? new Date(sceneRow.created_at).toISOString() : undefined,
    updatedAt: sceneRow.updated_at ? new Date(sceneRow.updated_at).toISOString() : undefined,
  };
}

function mapProjectRow(projectRow, scenes) {
  return {
    id: projectRow.id,
    title: projectRow.title,
    description: projectRow.description ?? undefined,
    thumbnail: projectRow.thumbnail ?? undefined,
    storyline: normalizeStorylineFromRow(projectRow),
    storylineSource: projectRow.storyline_source,
    storylineConfirmed: projectRow.storyline_confirmed === 1,
    currentStage: projectRow.current_stage,
    activeMuse: projectRow.active_muse,
    scenes,
    museControlLevel: projectRow.muse_control_level,
    createdAt: projectRow.created_at ? new Date(projectRow.created_at).toISOString() : undefined,
    updatedAt: projectRow.updated_at ? new Date(projectRow.updated_at).toISOString() : undefined,
  };
}

function mapProjectsMinimal(projectRows) {
  return projectRows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    thumbnail: row.thumbnail ?? undefined,
    storyline: normalizeStorylineFromRow(row),
    storylineSource: row.storyline_source,
    storylineConfirmed: row.storyline_confirmed === 1,
    currentStage: row.current_stage,
    activeMuse: row.active_muse,
    museControlLevel: row.muse_control_level,
    sceneCount: row.scene_count ?? 0,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  }));
}

async function fetchMuseJson(pathname, body) {
  const res = await fetch(`${MUSE_STUDIO_BASE_URL}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`Muse Studio HTTP ${res.status} on ${pathname}: ${detail || res.statusText}`);
  }
  return await res.json().catch(() => ({}));
}

/** Scene payload for `ingestScene` (object form or JSON string via `sceneJson`). */
const ingestSceneObjectSchema = z.object({
  sceneId: z.string().describe('scene id'),
  sceneNumber: z.number().int(),
  title: z.string(),
  heading: z.string(),
  description: z.string(),
  dialogue: z.string().optional().nullable(),
  technicalNotes: z.string().optional().nullable(),
});

async function fetchMuseSseText(pathname, body) {
  const res = await fetch(`${MUSE_STUDIO_BASE_URL}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`Muse Studio HTTP ${res.status} on ${pathname}: ${detail || res.statusText}`);
  }
  const { finalText } = await readSseUntilFinal(res);
  return finalText;
}

const getServer = () => {
  const server = new McpServer({
    name: 'mcp-muse-studio',
    version: '0.1.0',
  });

  // Tools are registered conditionally using MCP_ALLOWED_TOOLS and MCP_ALLOW_WRITE.
  const registerToolIfAllowed = (toolName, config, handler) => {
    if (!shouldEnableTool(toolName)) return;
    server.registerTool(toolName, config, handler);
  };

  registerToolIfAllowed(
    'muse_health',
    {
      description: 'Get Muse Studio health and provider availability.',
      inputSchema: {},
    },
    async () => {
      const res = await fetch(`${MUSE_STUDIO_BASE_URL}/api/health`);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Muse Studio health error: HTTP ${res.status} ${txt}`);
      }
      const json = await res.json();
      return { content: [{ type: 'text', text: safeJsonStringify(json) }] };
    },
  );

  registerToolIfAllowed(
    'listProjects',
    {
      title: 'List Muse projects',
      description: 'List projects (metadata only) from Muse Studio SQLite.',
      inputSchema: {},
    },
    async () => {
      const db = openDb();
      try {
        const rows = getRows(
          db,
          `
          SELECT p.*,
                 (SELECT COUNT(*) FROM scenes s WHERE s.project_id = p.id) AS scene_count
          FROM projects p
          ORDER BY p.updated_at DESC
          `,
        );
        return {
          content: [
            { type: 'text', text: safeJsonStringify(mapProjectsMinimal(rows)) },
          ],
        };
      } finally {
        db.close();
      }
    },
  );

  registerToolIfAllowed(
    'getProject',
    {
      title: 'Get Muse project',
      description: 'Read a full project with scenes, keyframes and reference images from Muse Studio SQLite.',
      inputSchema: {
        projectId: z.string().describe('Muse project id'),
      },
    },
    async ({ projectId }) => {
      const db = openDb();
      try {
        const projectRow = getRow(db, 'SELECT * FROM projects WHERE id = ?', [projectId]);
        if (!projectRow) {
          return { content: [{ type: 'text', text: safeJsonStringify(null) }] };
        }

        const sceneRows = getRows(db, 'SELECT * FROM scenes WHERE project_id = ? ORDER BY scene_number', [
          projectId,
        ]);

        const scenes = [];
        for (const sceneRow of sceneRows) {
          const keyframeRows = getRows(db, 'SELECT * FROM keyframes WHERE scene_id = ? ORDER BY sequence_order', [
            sceneRow.id,
          ]);
          const keyframes = [];
          for (const keyframeRow of keyframeRows) {
            const refs = getRows(db, 'SELECT * FROM reference_images WHERE keyframe_id = ?', [
              keyframeRow.id,
            ]);
            const kf = mapKeyframe(keyframeRow);
            kf.referenceImages = mapReferenceImages(refs);
            keyframes.push(kf);
          }
          scenes.push(mapSceneRow(sceneRow, keyframes));
        }

        return { content: [{ type: 'text', text: safeJsonStringify(mapProjectRow(projectRow, scenes)) }] };
      } finally {
        db.close();
      }
    },
  );

  registerToolIfAllowed(
    'generateStory',
    {
      title: 'Generate storyline / script text',
      description: 'Generate Story Muse output (streamed in Muse Studio, buffered here).',
      inputSchema: {
        projectId: z.string().optional().describe('Optional Muse project id for RAG context'),
        task: z.string().optional().describe('Muse story task'),
        prompt: z.string().describe('Prompt to send to Muse Story Muse'),
        providerId: z.string().optional().describe('Muse provider_id (ollama/openai/claude/...)'),
        // Pass-through extras are allowed but will be forwarded as additional request fields.
      },
    },
    async (args) => {
      const { projectId, task, prompt, providerId, ...rest } = args;
      const body = {
        task,
        prompt,
        ...(projectId ? { project_id: projectId } : {}),
        ...(providerId ? { provider_id: providerId } : {}),
        ...rest,
      };
      const text = await fetchMuseSseText('/api/generate/story', body);
      return { content: [{ type: 'text', text }] };
    },
  );

  registerToolIfAllowed(
    'generateScenes',
    {
      title: 'Generate scenes',
      description: 'Generate long-form scenes (SSE in Muse Studio, buffered here).',
      inputSchema: {
        projectId: z.string().describe('Muse project id'),
        targetScenes: z.number().int().min(1).max(120).describe('Approx scene count (Muse caps internally)'),
      },
    },
    async ({ projectId, targetScenes }) => {
      assertWriteAllowed({ projectId });

      // Muse Studio route expects targetScenes in JSON key `targetScenes`.
      const body = { projectId, targetScenes };
      // Buffer to ensure DB ingestion completes.
      await fetchMuseSseText('/api/generate/scenes', body).catch(async (err) => {
        // If Muse fails early, still throw a useful error.
        throw err;
      });
      const project = await callToolGetProject(projectId);
      return { content: [{ type: 'text', text: safeJsonStringify(project) }] };
    },
  );

  registerToolIfAllowed(
    'ingestScene',
    {
      title: 'Ingest a scene',
      description:
        'Ingest a single scene into Muse Studio (writes to SQLite). Pass either `scene` (object) or `sceneJson` (one JSON string). For long descriptions, prefer `sceneJson` so the client does not truncate nested fields or break XML-style tool parsers.',
      inputSchema: {
        projectId: z.string().describe('Muse project id'),
        scene: ingestSceneObjectSchema
          .optional()
          .describe('Scene fields as a structured object.'),
        sceneJson: z
          .string()
          .optional()
          .describe(
            'Alternative: full scene as a single JSON string (same keys as `scene`). Use when descriptions are long or tool-call output gets cut off.',
          ),
      },
    },
    async ({ projectId, scene, sceneJson }) => {
      assertWriteAllowed({ projectId });
      const hasScene = scene != null && typeof scene === 'object';
      const hasJson = sceneJson != null && String(sceneJson).trim() !== '';
      if (hasScene === hasJson) {
        throw new Error('Provide exactly one of `scene` (object) or `sceneJson` (string).');
      }
      let resolved;
      if (hasJson) {
        try {
          resolved = ingestSceneObjectSchema.parse(JSON.parse(String(sceneJson)));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`sceneJson must be valid JSON for the scene shape: ${msg}`);
        }
      } else {
        resolved = ingestSceneObjectSchema.parse(scene);
      }
      await fetchMuseJson('/api/scenes', {
        projectId,
        scene: {
          sceneId: resolved.sceneId,
          sceneNumber: resolved.sceneNumber,
          title: resolved.title,
          heading: resolved.heading,
          description: resolved.description,
          dialogue: resolved.dialogue ?? null,
          technicalNotes: resolved.technicalNotes ?? null,
        },
      });
      const project = await callToolGetProject(projectId);
      return { content: [{ type: 'text', text: safeJsonStringify(project) }] };
    },
  );

  registerToolIfAllowed(
    'orchestrate',
    {
      title: 'Run orchestrator',
      description: 'Run Muse Supervisor orchestrate step for a project.',
      inputSchema: {
        projectId: z.string().describe('Muse project id'),
        goal: z.string().optional().describe('Supervisor goal'),
        targetTotal: z.number().int().optional().describe('Optional target scene count'),
      },
    },
    async ({ projectId, goal, targetTotal }) => {
      assertWriteAllowed({ projectId });
      const data = await fetchMuseJson('/api/agent/orchestrate', {
        projectId,
        goal,
        targetTotal: targetTotal ?? null,
      });
      return { content: [{ type: 'text', text: safeJsonStringify(data) }] };
    },
  );

  registerToolIfAllowed(
    'videoEditor',
    {
      title: 'Run video editor',
      description: 'Run Muse Video Editor Agent (stitch/smart edit) for a project.',
      inputSchema: {
        projectId: z.string().describe('Muse project id'),
        mode: z.string().optional().describe('SIMPLE_STITCH or SMART_EDIT (or SMART_EDIT_REMOTION)'),
      },
    },
    async ({ projectId, mode }) => {
      assertWriteAllowed({ projectId });
      const data = await fetchMuseJson('/api/agent/video-editor', {
        projectId,
        mode,
      });
      return { content: [{ type: 'text', text: safeJsonStringify(data) }] };
    },
  );

  registerToolIfAllowed(
    'applyFilmTimeline',
    {
      title: 'Apply film timeline',
      description: 'Apply a user-edited film timeline to re-render master output.',
      inputSchema: {
        projectId: z.string().describe('Muse project id'),
        // z.record(z.any()) can trip some MCP client schema loaders; use passthrough object for compatibility.
        filmTimeline: z.object({}).passthrough().describe('Film timeline JSON'),
        outputKind: z.enum(['remotion', 'ffmpeg']).optional().describe('Renderer mode'),
      },
    },
    async ({ projectId, filmTimeline, outputKind }) => {
      assertWriteAllowed({ projectId });
      const data = await fetchMuseJson('/api/agent/film/apply-timeline', {
        projectId,
        filmTimeline,
        outputKind: outputKind ?? 'remotion',
      });
      return { content: [{ type: 'text', text: safeJsonStringify(data) }] };
    },
  );

  async function callToolGetProject(projectId) {
    const db = openDb();
    try {
      const projectRow = getRow(db, 'SELECT * FROM projects WHERE id = ?', [projectId]);
      if (!projectRow) return null;

      const sceneRows = getRows(db, 'SELECT * FROM scenes WHERE project_id = ? ORDER BY scene_number', [
        projectId,
      ]);

      const scenes = [];
      for (const sceneRow of sceneRows) {
        const keyframeRows = getRows(db, 'SELECT * FROM keyframes WHERE scene_id = ? ORDER BY sequence_order', [
          sceneRow.id,
        ]);
        const keyframes = [];
        for (const keyframeRow of keyframeRows) {
          const refs = getRows(db, 'SELECT * FROM reference_images WHERE keyframe_id = ?', [
            keyframeRow.id,
          ]);
          const kf = mapKeyframe(keyframeRow);
          kf.referenceImages = mapReferenceImages(refs);
          keyframes.push(kf);
        }
        scenes.push(mapSceneRow(sceneRow, keyframes));
      }

      return mapProjectRow(projectRow, scenes);
    } finally {
      db.close();
    }
  }

  return server;
};

const app = createMcpExpressApp();

// Optional auth for remote clients
app.use('/mcp', requireAuth);

// Stateless streamable-HTTP MCP server.
app.post('/mcp', async (req, res) => {
  const server = getServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

app.get('/mcp', async (req, res) => {
  res.status(405).send(JSON.stringify({ error: 'Method not allowed' }));
});

app.delete('/mcp', async (req, res) => {
  res.status(405).send(JSON.stringify({ error: 'Method not allowed' }));
});

const httpServer = app.listen(PORT, BIND_HOST, () => {
  console.log(`Muse MCP server listening at http://${BIND_HOST}:${PORT}/mcp`);
  console.log(`Muse Studio base URL: ${MUSE_STUDIO_BASE_URL}`);
  console.log(`MUSE_STUDIO_DB_PATH: ${MUSE_STUDIO_DB_PATH}`);
  if (MCP_AUTH_TOKEN) console.log('MCP auth: enabled (Bearer token required)');
  console.log(`MCP_ALLOW_WRITE=${MCP_ALLOW_WRITE}`);
});

httpServer.on('error', (err) => {
  console.error('MCP HTTP server error:', err);
});

httpServer.on('close', () => {
  console.log('MCP HTTP server closed.');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down MCP HTTP server...');
  httpServer.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down MCP HTTP server...');
  httpServer.close(() => {
    process.exit(0);
  });
});

