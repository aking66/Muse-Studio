# Changelog

All notable changes to Muse Studio are documented here. Release titles match Git tags (e.g. `v1.5.0`).

---

## [1.5.0] — 2026-03-28

### User-facing features

- **Unified product version** — **1.5.0** is shown in **Settings → About**, in backend **`GET /health`**, and across published npm packages (`muse-studio`, `@muse/plugin-host`, `@muse/plugin-sdk`, `mcp-muse-studio`).
- **OpenRouter** — First-class LLM provider (OpenAI-compatible API); keys only in env files; model and base URL in Settings; works from Next.js routes and Python agents when configured.
- **LM Studio** — Supported for Story Muse and related flows; optional scene-route integration; Qwen “thinking” hide documented in README.
- **Plugin extensions** — **Settings → Plugins** for add-on providers; image/video generation can use **ComfyUI workflows** or **plugin providers** (kanban & playground); fallback from plugin to Comfy on failure where implemented.
- **MCP bridge** — `mcp-muse-studio/` package exposes an MCP adapter for tooling and automation (see its README).
- **Video Editor Agent** — Simple Stitch / Smart Edit and polished **Remotion** export path via `packages/remotion-film` (FilmMaster); documented in README.
- **Security** — `scripts/security_dependency_guard.py` and `SECURITY.md` for supply-chain checks (optional CI use).

### Codebase & architecture

- **Story & batch scene generation** — Logic consolidated under `muse-studio/lib/generation/` (`storyGenerationInternals`, `scenesBatchSupport`, `openRouterHeaders`, `comfyPluginGeneration`) so API routes stay thin.
- **Job polling** — Shared helpers: `muse-studio/hooks/useJobPoll.ts`, `muse-studio/lib/jobs/jobPolling.ts`; consistent Comfy/plugin job handling in dialogs and playground.
- **Server utilities** — `muse-studio/lib/server/ids.ts`, `paths.ts` for shared path/id conventions.
- **Backend LLM prompts** — `muse_backend/app/providers/llm/shared_prompts.py` centralizes Story Muse task prompts; **OpenAI, Claude, OpenRouter, LM Studio, Ollama** providers import shared strings instead of duplicating large blocks.
- **Plugin system** — SQLite schema for plugins in `muse-studio/db/index.ts`; actions and API routes under `muse-studio/app/api/plugins/` and `.../generate/plugin-provider/`; `muse-studio/lib/plugin-extension/` for manifest/types/contracts; `packages/plugin-host` and `packages/plugin-sdk` versioned with the app; sample `packages/plugin-template-zimage-turbo`.
- **Backend API** — `muse_backend/app/main.py` exposes `APP_VERSION` (1.5.0); health response includes **`version`**; FastAPI OpenAPI shows the same version.
- **Plugin compatibility constant** — `HOST_MUSE_VERSION` in `muse-studio/lib/plugin-extension/plugin-types.ts` set to **1.5.0** for third-party manifests.

### Documentation

- **README** — What’s New, OpenRouter, Remotion, publishing, credits, security checks; health JSON example uses `"version": "1.5.0"`.
- **PlugIns Development Documentation.md** — Plugin manifest and extension notes aligned with current patterns.

---

## Earlier releases

Prior work on `main` before `v1.5.0` (video editor agent, ComfyUI integration, contributor docs, etc.) is summarized in README **§1 What’s New** and in git history.
