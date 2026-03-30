# MCP Muse Studio Adapter

This package exposes Muse Studio workflows to an external agent (for example `openClaw`) via **MCP**.

## Updates

- 2026-03-30: `ingestScene` accepts optional `sceneJson` (one JSON string) as well as `scene` (object), for long descriptions and clients that truncate nested tool-call XML.
- 2026-03-30: Loads optional `mcp-muse-studio/.env` on startup (via `dotenv`) so `MCP_*` / `MUSE_*` vars do not need to be exported in the shell. See `.env.example`.
- 2026-03-27: MVP MCP adapter added. It exposes Muse Studio tools (`listProjects`, `getProject`, `generateStory`, `generateScenes`, `orchestrate`, `videoEditor`, `applyFilmTimeline`) over MCP Streamable HTTP, with write operations gated by `MCP_ALLOW_WRITE` and optional auth via `MCP_AUTH_TOKEN`.

## What’s included (MVP)

Read tools:
- `muse_health` (Muse Studio health)
- `listProjects` (SQLite metadata only)
- `getProject` (project + scenes + keyframes + reference images)
- `generateStory` (calls Muse Studio `/api/generate/story`, buffers SSE, returns final text)

Write tools (require `MCP_ALLOW_WRITE=true`):
- `generateScenes` (calls Muse Studio `/api/generate/scenes`, buffers SSE, then reads the updated project)
- `ingestScene` (calls Muse Studio `/api/scenes`; pass `scene` or `sceneJson`)
- `orchestrate` (calls Muse Studio `/api/agent/orchestrate`)
- `videoEditor` (calls Muse Studio `/api/agent/video-editor`)
- `applyFilmTimeline` (calls Muse Studio `/api/agent/film/apply-timeline`)

## Environment variables

You can set these in the process environment or in a **`.env` file** next to `server.mjs` (copy from `.env.example`). The server loads `.env` automatically before reading configuration.

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

### Smoke test (local)

The Streamable HTTP transport requires **`Accept: application/json, text/event-stream`** on every `POST /mcp` request. Without it, the server returns `400` with *“Not Acceptable: Client must accept both application/json and text/event-stream”*.

PowerShell (Windows), after `npm run start`:

```powershell
$headers = @{ Accept = "application/json, text/event-stream" }
$body = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.1"}}}'
Invoke-RestMethod -Uri "http://127.0.0.1:3333/mcp" -Method Post -ContentType "application/json" -Headers $headers -Body $body
```

You should see an SSE-style response whose `data:` line includes `"serverInfo":{"name":"mcp-muse-studio",...}`.

### openClaw / remote agents

- **`web_fetch` / URL tools blocked for `127.0.0.1`**: Many agents block fetches to loopback/private IPs for security. That is expected; use the product’s **native MCP client** (stdio or configured HTTP MCP transport), not generic `http://127.0.0.1/...` fetch.
- **`Unrecognized key: "mcpServers"`**: Your openClaw config schema may differ from what you pasted. Use the MCP configuration format documented for **your installed openClaw version** (keys and nesting change between releases).
- **Missing `docs/mcp.md`**: If openClaw looks for a file under its npm install path, reinstall or update openClaw, or open an issue with the openClaw project—this repo does not ship that file.

### “Failed to parse tool call: Unexpected end of content”

That usually means the **model output was cut off** before the tool call finished (often mid-string inside a long `description`). Raise the client’s **max output tokens**, shorten the scene text, split into multiple calls, or call `ingestScene` with **`sceneJson`** set to a **single JSON string** for the whole scene object (fewer nested tokens for XML-style bridges).

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

