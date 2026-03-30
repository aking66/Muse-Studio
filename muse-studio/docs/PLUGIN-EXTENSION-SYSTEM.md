# Muse Extensions (MCP) - User Guide

This guide explains how users connect and use MCP Extensions in Muse Studio.

## What changed

Muse now uses an MCP-first extension model.

- Use `Settings -> Extensions` to register MCP servers.
- Use `/mcp-extensions` to chat and run extension tools.
- Per-tool policies let you choose:
  - `auto`: run immediately
  - `ask`: require confirmation before execution

Legacy plugin docs based on GitHub manifest install are not the primary user flow.

## Where to use Extensions

- **Setup page:** `Settings -> Extensions`
- **Runtime page:** `Extensions` (`/mcp-extensions`)

## Quick start (for users)

1. Start your MCP server (for example, Z-Image Turbo).
2. Open `Settings -> Extensions`.
3. Add the MCP endpoint URL (typically `http://127.0.0.1:<port>/mcp`).
4. Enable the extension.
5. Open `/mcp-extensions`.
6. In the right panel:
   - enable/disable tools
   - set `auto` or `ask` policy per tool
7. Chat to generate/run tools, or use `Run MCP tool...` for direct JSON input.

## Tool controls in `/mcp-extensions`

Right panel provides:

- Extension enable/disable switch
- Tool-level toggle (on/off)
- Tool policy:
  - `auto` runs without prompt
  - `ask` shows a pending approval banner in chat first

## Chat behavior

- LLM sees only enabled tools.
- If policy is `ask`, the assistant returns a pending tool card and waits for your confirmation.
- Tool outputs are shown inline:
  - images
  - videos
  - JSON/text results

## Media output actions

For generated media in Extensions chat:

- Image:
  - `Assign to keyframe...`
  - `Assign to character...`
- Video:
  - `Assign video to scene...`

Media preview supports full-size expansion (lightbox) for both images and videos.

## Data and persistence

Muse stores extension control state and chat history in SQLite, including:

- extension endpoints, hooks, and enabled flags
- per-hook MCP policy (`auto` or `ask`)
- `/mcp-extensions` chat history

## Common issues

- **Extension not showing tools**
  - Ensure extension is enabled in settings.
  - Ensure tool is enabled in the right panel.
  - Verify MCP endpoint is reachable.

- **Tool always asks before running**
  - Policy is set to `ask`; change to `auto`.

- **Generated media not assignable**
  - Verify the tool returned a valid image/video output path or preview URL.

- **HTTP MCP failures**
  - Confirm server is running and endpoint is `/mcp`.
  - Confirm host/port are correct.

## For extension developers

Use the repository-level document:

- `PlugIns Development Documentation.md`

That file covers MCP architecture, tool behavior, and template startup details.

