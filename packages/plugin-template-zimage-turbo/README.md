# Z-Image Turbo (MCP)

Local **Z-Image Turbo** inference using Hugging Face `diffusers` (`ZImagePipeline`) and a folder layout matching [Tongyi-MAI/Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo).

This package is **MCP-only** (FastMCP). There is no HTTP plugin server.

## Setup

1. Python 3.10+ with CUDA PyTorch recommended.
2. Copy `config.example.json` to `config.json` and set `model_root`, **or** set `ZIMAGE_MODEL_DIR` (see below).
3. Optional: copy `.env.example` to **`.env`** in this folder for `ZIMAGE_MCP_TRANSPORT`, ports, or `ZIMAGE_MODEL_DIR`. Env vars from `.env` override `config.json` for the model path when `ZIMAGE_MODEL_DIR` is set.
4. Install:

```bash
pip install -r requirements.txt
```

The package loads **`plugin-template-zimage-turbo/.env`** automatically (via `python-dotenv`) before reading `config.json` / the environment.

## Run (MCP)

**stdio (default)** — typical for Cursor / Claude Desktop:

```bash
python -m app.mcp_server
```

**Streamable HTTP** (e.g. Muse Studio **MCP Extension** / `POST /mcp`):

Set variables in **`.env`** or the shell, then:

```bash
set ZIMAGE_MCP_TRANSPORT=streamable-http
set ZIMAGE_MCP_HOST=127.0.0.1
set ZIMAGE_MCP_PORT=18182
python -m app.mcp_server
```

Clients must send `Accept: application/json, text/event-stream` on MCP HTTP requests.

### Tools

| Tool | Purpose |
|------|--------|
| `zimage_health` | Model path, outputs dir, CUDA availability (does not load weights). |
| `zimage_generate` | Text-to-image; writes PNG under `PLUGIN_OUTPUTS_DIR` (default `./outputs`). |

### Environment

| Variable | Meaning |
|----------|--------|
| `ZIMAGE_MODEL_DIR` | Override model folder (else `config.json` `model_root`). |
| `PLUGIN_OUTPUTS_DIR` | Where PNGs are written (default `./outputs`). |
| `PLUGIN_PUBLIC_BASE_URL` | Optional. If set, `finalImage.url` is `…/assets/<rel_path>` under this base. If unset, `finalImage.url` uses a **`file://`** URI to the saved file. |
| `ZIMAGE_MCP_TRANSPORT` | `stdio` (default), `streamable-http`, or `sse`. |
| `ZIMAGE_MCP_HOST` / `ZIMAGE_MCP_PORT` | Listen address for HTTP transports (default `127.0.0.1:18182`). |

Use the returned **`image_path`** (absolute path) from `zimage_generate` when integrating with tools that read local files.
