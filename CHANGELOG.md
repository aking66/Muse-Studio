# Changelog

All notable changes to Muse Studio are documented here. Release titles match Git tags (e.g. `v1.5.0`).

---

## [1.5.2] - 2026-03-31

### Highlights

- Refresh MCP and plugin extension integration paths in `muse-studio` and `mcp-muse-studio`.
- Update generation/provider routing and UI flows (draft/refine, kanban/playground, extensions pages).
- Clean up backend/provider model pipeline footprint and align runtime contracts and schemas.

## [1.5.0] - 2026-03-28

### User-facing features

- Unified product version shown in Settings -> About, backend `GET /health`, and package metadata.
- OpenRouter as a first-class LLM provider (OpenAI-compatible API with env-based keys).
- LM Studio support for Story Muse and related routes.
- Plugin extensions flow in settings and generation dialogs.
- MCP bridge via `mcp-muse-studio`.
- Video Editor Agent export paths (Simple Stitch, Smart Edit, Remotion polished render).
- Security checks with `scripts/security_dependency_guard.py` and `SECURITY.md`.

### Codebase and architecture

- Story and batch scene generation logic consolidated in `muse-studio/lib/generation/`.
- Shared job polling helpers and server utility modules.
- Shared Story Muse prompts in `muse_backend/app/providers/llm/shared_prompts.py`.
- Plugin extension contracts/actions plus SDK/host package integration.
- Backend API version surfaced via `APP_VERSION` in `muse_backend/app/main.py`.

### Documentation

- README updates for setup, providers, release notes, and security checks.
- Plugin development docs aligned with current extension patterns.

---

## Earlier releases

Prior work before `v1.5.0` is summarized in README section "What's New" and in git history.
