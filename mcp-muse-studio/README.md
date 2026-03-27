# MCP Muse Studio Adapter

This package exposes Muse Studio workflows to an external agent (for example `openClaw`) via **MCP**.

## Updates

- 2026-03-27: MVP MCP adapter added. It exposes Muse Studio tools (`listProjects`, `getProject`, `generateStory`, `generateScenes`, `orchestrate`, `videoEditor`, `applyFilmTimeline`) over MCP Streamable HTTP, with write operations gated by `MCP_ALLOW_WRITE` and optional auth via `MCP_AUTH_TOKEN`.

## What’s included (MVP)

Read tools:
- `muse_health` (Muse Studio health)
- `listProjects` (SQLite metadata only)
- `getProject` (project + scenes + keyframes + reference images)
- `generateStory` (calls Muse Studio `/api/generate/story`, buffers SSE, returns final text)

Write tools (require `MCP_ALLOW_WRITE=true`):
- `generateScenes` (calls Muse Studio `/api/generate/scenes`, buffers SSE, then reads the updated project)
- `ingestScene` (calls Muse Studio `/api/scenes`)
- `orchestrate` (calls Muse Studio `/api/agent/orchestrate`)
- `videoEditor` (calls Muse Studio `/api/agent/video-editor`)
- `applyFilmTimeline` (calls Muse Studio `/api/agent/film/apply-timeline`)

## Environment variables

- `MCP_PORT` (default `3333`)
- `MCP_BIND_HOST` (default `127.0.0.1`)
- `MUSE_STUDIO_BASE_URL` (default `http://127.0.0.1:3000`)
- `MUSE_STUDIO_DB_PATH` (default points at repo `muse-studio/db/muse.db`)
- `MCP_AUTH_TOKEN` (optional; if set, remote clients must use `Authorization: Bearer <token>`)
- `MCP_ALLOW_WRITE` (default `false`)
- `MCP_ALLOWED_TOOLS` (optional; comma-separated list of enabled tool names)
- `MCP_ALLOWED_PROJECT_IDS` (optional; comma-separated list; required for write tools if set)

## Run

From `mcp-muse-studio/`:

```bash
npm install
npm run start
```

Server endpoint:
- `POST /mcp` (Streamable HTTP MCP)

## Test plan (manual)

1. Start Muse Studio UI and backend (per the main repo README).
2. Start this MCP server with:
   - `MUSE_STUDIO_BASE_URL` pointing to your running Muse Studio.
   - For write testing: `MCP_ALLOW_WRITE=true`.
3. From `openClaw` (or any MCP client), connect to `http://<host>:<MCP_PORT>/mcp`.
4. Call the tools in this order:
   - `listProjects`
   - `getProject` (pick an existing `projectId`)
   - `generateStory` (prompt/story task)
   - `generateScenes` (with the same `projectId` and `targetScenes`)
   - `orchestrate` (e.g. `goal="next_step"`)
   - `videoEditor` (mode `SIMPLE_STITCH`, after final scenes exist)
   - `applyFilmTimeline` (export/master re-render based on a FilmTimeline JSON; optional)

