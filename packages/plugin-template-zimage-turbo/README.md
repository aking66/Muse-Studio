# Z-Image Turbo Demo Plugin Template

Reference plugin extension template for Muse `image.generate`, inspired by:

- `muse_backend/app/providers/image/zimage_provider.py`

This template runs as an **external plugin service** and is intended as a starter project for third-party developers.

## What this demo does

- Exposes plugin endpoints:
  - `GET /health`
  - `POST /hooks/image.generate`
- Accepts Muse canonical `image.generate` payload
- Produces a demo PNG output and returns `finalImage.url`

It does **not** run real model inference yet. Replace adapter logic in:

- `app/zimage_adapter.py` -> `generate_demo_image()`

## Folder structure

```text
plugin-template-zimage-turbo/
  plugin.manifest.json
  requirements.txt
  app/
    main.py
    schemas.py
    zimage_adapter.py
```

## Quick start

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Run the plugin service:

```bash
uvicorn app.main:app --host 127.0.0.1 --port 18181 --reload
```

3. In Muse Studio (`Settings -> Plugins`), add this plugin repo URL and enable it.

4. Use Playground/Kanban provider selector:
   - Provider = `Plugin`
   - Capability = `image.generate`

## Environment variables

- `PORT` (default `18181`)
- `HOST` (default `127.0.0.1`)
- `PLUGIN_OUTPUTS_DIR` (default `./outputs`)
- `PLUGIN_PUBLIC_BASE_URL` (default built from `HOST:PORT`)

## `plugin.manifest.json` notes

- `service.baseUrl` defaults to `http://127.0.0.1:18181`
- capability hook:
  - `image.generate` -> `/hooks/image.generate`

## Integrating real Z-Image Turbo

When replacing the demo implementation:

1. Parse `MuseImageGenerateInput`
2. Run your real img2img/refinement pipeline
3. Save output under `PLUGIN_OUTPUTS_DIR`
4. Return:

```json
{
  "finalImage": {
    "url": "http://127.0.0.1:18181/assets/<your-output-path>.png",
    "width": 1280,
    "height": 720
  },
  "metadata": {
    "provider": "zimage_turbo_demo"
  }
}
```

