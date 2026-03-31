# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Muse Studio (v1.5.0) is a local-first workspace for planning, visualizing, and iterating on stories and video concepts. It has three components:

- **Frontend** (`muse-studio/`) — Next.js 16 + React 19 + Tailwind v4 + SQLite (better-sqlite3)
- **Backend** (`muse_backend/`) — FastAPI + LangGraph agents + ML model providers (PyTorch, diffusers, transformers)
- **Packages** (`packages/`) — Shared npm packages: `plugin-sdk`, `plugin-host`, `plugin-template-zimage-turbo`, `remotion-film`
- **MCP Server** (`mcp-muse-studio/`) — External tool integration via Model Context Protocol

## Development Commands

### Frontend
```bash
cd muse-studio
npm install
npm run dev          # Dev server at http://localhost:4500
npm run build        # Production build
npm run lint         # ESLint
```

### Backend
```bash
cd muse_backend
python -m venv .venv && source .venv/bin/activate
# Install PyTorch with CUDA FIRST (not from requirements.txt):
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
# Optional: CUDA-enabled llama-cpp-python:
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python
pip install -r requirements.txt
cp .env.example .env   # Add API keys
python run.py          # Uvicorn at http://localhost:4501
```

### Tests (backend only)
```bash
cd muse_backend
pytest                     # All tests
pytest -m integration      # Integration tests only
pytest -v --tb=short       # Verbose output
```

### Security scan
```bash
python scripts/security_dependency_guard.py
```

### Both services at once
```bash
bash run-muse.sh    # Linux/macOS
```

## Architecture

### Frontend (Next.js App Router)

- **Database:** SQLite via better-sqlite3 in `muse-studio/db/index.ts`. Tables: `projects`, `scenes`, `keyframes`, `reference_images`, `character_sheets`, `plugins`.
- **Server Actions:** `lib/actions/` — 12 directories of server actions for CRUD operations.
- **Generation Logic:** `lib/generation/` — Story generation (SSE streaming), batch scene generation, ComfyUI+plugin fallback.
- **Job Polling:** `lib/jobs/jobPolling.ts` + `hooks/useJobPoll.ts` — Shared polling (fast: 2.5s, background: 60s, motionMuse: 180s).
- **Backend Client:** `lib/backend-client.ts` — HTTP client for Python backend.
- **Plugin System:** `lib/plugin-extension/` re-exports from `@muse/plugin-sdk` and `@muse/plugin-host`. Plugins stored in SQLite, called via HTTP.
- **Path aliases:** `@/*` maps to `muse-studio/*`; `@muse/plugin-sdk` and `@muse/plugin-host` are workspace packages.
- **Config:** `next.config.ts` transpiles `@muse/*` packages; excludes `better-sqlite3` from server bundle.

### Backend (FastAPI)

**Entry:** `app/main.py` — CORS allows `localhost:4500`. Swagger docs at `/docs`.

**Provider System** (core abstraction):
- Base classes in `app/providers/base.py`: `ImageDraftProvider`, `ImageRefineProvider`, `VideoProvider`, `LLMProvider`
- Registry in `app/registry.py` maps provider IDs to classes
- Each provider implements async `generate()`
- Image: Qwen (img2img), FLUX.2-Klein (text2image), Z-Image Turbo (refine)
- Video local: LTX-Video 2, Wan 2.2 (with format variants: bf16/fp16/fp8/gguf)
- Video API: Kling, SeedDance, Runway
- LLM: OpenAI, OpenRouter, Claude (Anthropic), LM Studio, Ollama

**Agent System** (LangGraph-based, in `app/agents/`):
- `story_muse.py` — Storyline/script generation
- `visual_muse.py` — Image generation suggestions
- `motion_muse.py` — Video generation orchestration
- `video_editor_agent.py` — Timeline editing + Remotion export
- `suggestion_agent.py` — Story suggestions
- `supervisor_graph.py` — Multi-agent orchestration
- `omni_batch.py` — Batch processing

**ComfyUI Integration:** `comfyui_runner.py` (WebSocket listener + job tracking) and `comfyui_workflow.py` (JSON workflow parsing).

**Video Export:** `film_timeline_schema.py` (Pydantic schema) → `remotion_render.py` (shells out to `npx remotion render` in `packages/remotion-film`).

**Configuration:** `muse_config.json` defines paths, active providers, model formats. Environment variables override config. See `.env.example` for required API keys.

### Key API Endpoints

| Backend Route | Purpose |
|---|---|
| `POST /generate/story` | Storyline generation (SSE stream) |
| `POST /generate/scenes` | Batch scene generation |
| `POST /generate/draft` | Draft image (text2image) |
| `POST /generate/refine` | Refine image |
| `POST /generate/video` | Video generation |
| `POST /agent/orchestrate` | Multi-agent coordination |
| `POST /agent/video-editor` | Video timeline editing |
| `GET /providers` | List available providers |
| `GET /health` | Server status + available models |

### Plugin Development

Plugins follow the manifest schema in `packages/plugin-sdk`. See `packages/plugin-template-zimage-turbo` for an example. Plugins implement HTTP endpoints for capabilities like `image.generate` and `video.generate`. Documentation in `PlugIns Development Documentation.md`.

## Code Conventions

- Comments and documentation in English only
- Technical analysis and comparison tables in English
- Git commits: English, no emojis, conventional commit format (feat:, fix:, docs:)
- Follow "LESS IS MORE" — minimal changes, optimize existing code
- New providers: extend base class, register in `registry.py`, implement async `generate()`
- New agents: use LangGraph, define state and transitions
- Shared LLM prompts live in `app/providers/llm/shared_prompts.py`
