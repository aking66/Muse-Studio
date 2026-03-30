# PlugIns Development Documentation (MCP Extensions)

This document describes the **current** extension architecture in Muse Studio.

## TL;DR

- Muse is now **MCP-first** for Extensions.
- The main user pages are:
  - `Settings -> Extensions` (`/settings/extensions`)
  - `Extensions Console` (`/mcp-extensions`)
- The old GitHub `plugin.manifest.json` flow is no longer the recommended primary path for development in this repo.
- Extension startup, registration, and tool routing are now based on MCP server tools and policies.

---

## 1) Current Architecture

Muse Studio acts as an MCP client/orchestrator:

1. User configures an extension endpoint in **Settings -> Extensions**.
2. Muse discovers MCP tools from that endpoint and stores them in SQLite.
3. `/mcp-extensions` chat uses the LLM to pick a tool + input, then executes the tool through MCP.
4. Tool output (image/video/json) is rendered in chat.
5. Media can be assigned to project assets (keyframe/character/scene) from chat.

### Important behavior

- Tools can be enabled/disabled per extension and per hook.
- Each tool has policy:
  - `auto`: runs immediately when planned.
  - `ask`: requires user confirmation before execution.

---

## 2) Storage and Control Plane (SQLite)

Muse stores extension metadata in:

- `plugins`
- `plugin_endpoints`
- `plugin_hooks`
- `plugin_ui_extensions`
- `plugin_settings`

Additional MCP console state:

- `plugin_hooks.mcp_policy` (`auto` | `ask`)
- `mcp_extensions_chat_messages` (chat history rows for `/mcp-extensions`)

---

## 3) MCP Transport and Endpoints

Supported runtime shape for this project:

- **Streamable HTTP MCP** (`POST /mcp`) for server-style extensions.
- `stdio` for local/client workflows (outside Muse HTTP registration path).

For HTTP registration in Muse Settings:

- Use base URL like `http://127.0.0.1:18182/mcp` (or host/port variant).
- Muse will probe/list tools and map MCP tool names to Muse capabilities.

---

## 4) Extension Development Model (Now)

### Do this

- Build an MCP server exposing tools (for example `zimage_generate`, `zimage_health`).
- Return structured JSON with media paths/URLs where relevant.
- Keep tool names stable and descriptive.

### Don’t rely on old assumptions

- No requirement to publish via GitHub manifest for normal local development.
- No requirement to implement old `/hooks/<capability>` HTTP endpoints for MCP mode.

---

## 5) Tool Mapping and Execution

At runtime:

1. LLM receives the tool catalog (enabled tools only).
2. LLM outputs JSON orchestration plan (`capability`, optional `pluginId`, `input`).
3. Muse resolves target tool.
4. If policy is:
   - `auto` -> execute immediately.
   - `ask` -> return pending approval to UI; user confirms; then execute.

The Extensions chat UI now includes:

- tool previews
- pending approval banner for `ask` mode
- quick “Run MCP tool…” dialog for direct tool invocation with JSON args

---

## 6) Media Output Handling

For image/video tool results:

- Muse normalizes output preview URLs and supports full-size lightbox.
- Chat provides assignment actions:
  - Image -> assign to keyframe or character
  - Video -> assign to scene
- Source files under `outputs/drafts/mcp-extensions/...` are accepted for promotion into project libraries.

---

## 7) Reference: `plugin-template-zimage-turbo`

Path:

- `packages/plugin-template-zimage-turbo/`

This template is now **MCP-only**.

Key files:

- `app/mcp_server.py` (FastMCP server entry)
- `app/zimage_adapter.py` (generation adapter)
- `app/config_loader.py` (`.env` and model config loading)
- `.env.example`
- `requirements.txt`

Startup scripts:

- `start-mcp.bat`
- `start-mcp.sh`

These start scripts run the MCP server using shared Python venv at:

- `../muse_backend/.venv` (preferred per request)
- with monorepo fallback `../../muse_backend/.venv`

Run examples:

```bash
# Windows
packages\plugin-template-zimage-turbo\start-mcp.bat

# Bash
bash packages/plugin-template-zimage-turbo/start-mcp.sh
```

---

## 8) Recommended Local Dev Workflow

1. Start the extension MCP server (for example zimage template).
2. Open `Settings -> Extensions`.
3. Register MCP endpoint URL.
4. Enable extension and desired tools; set policy (`auto` or `ask`).
5. Open `/mcp-extensions`.
6. Test via chat or “Run MCP tool…”.
7. Verify media preview + assignment actions.

---

## 9) Backward Compatibility Note

Muse still contains compatibility code paths for non-MCP plugin-style integrations, but active development should target the MCP extension architecture described above.

If documentation elsewhere mentions:

- mandatory GitHub `plugin.manifest.json`,
- `/hooks/<capability>` as primary runtime path,
- old `Settings -> Plugins` flow,

consider those references legacy and update to `Settings -> Extensions` + MCP.

---

## 10) Troubleshooting

- **Extension not listed in chat tool catalog**
  - Check extension is enabled.
  - Check tool hook is enabled.
  - Confirm endpoint reachable and tool discovery succeeds.

- **Tool always asks for confirmation**
  - Change hook policy from `ask` to `auto` in right panel on `/mcp-extensions`.

- **Media generated but not assignable**
  - Ensure returned preview path resolves under Muse `outputs/`.
  - Verify file extension is supported image/video format.

- **HTTP MCP errors**
  - Confirm server is running with `streamable-http`.
  - Confirm endpoint path is `/mcp`.
  - Confirm client request headers include `Accept: application/json, text/event-stream` when required by server stack.

