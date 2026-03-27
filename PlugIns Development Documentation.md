# PlugIns Development Documentation

This document explains how third-party developers can create **Muse Plugin Extensions** (v1 MVP).

Muse Studio installs plugins from a **GitHub URL** by fetching a `plugin.manifest.json` file, then calls plugin endpoints via a **capability hook** contract.

## Required Packages and Why

Plugin developers should understand the two contract packages used by Muse:

### 1) `packages/plugin-sdk` (manifest/install-time contract)

Use this for plugin definition and compatibility checks.

- Validates `plugin.manifest.json` shape
- Defines manifest types (`service`, `hooks`, `uiExtensions`, `permissions`)
- Enforces API compatibility (`museApiVersion`, min/max host version)

In short: **this is the plugin registration contract**.

### 2) `packages/plugin-host` (runtime capability contract)

Use this for endpoint request/response payloads your plugin serves.

- Defines `image.generate` input/output types
- Defines `video.generate` input/output types
- Defines generic capability call envelope types

In short: **this is the runtime generation contract**.

### Canonical source of truth (host + authors)

| Concern | Package | Edit here (not in the app) |
|--------|---------|----------------------------|
| Manifest Zod schema, `parsePluginManifest`, version helpers | `@muse/plugin-sdk` (`packages/plugin-sdk`) | `packages/plugin-sdk/src/manifest.ts` |
| Image/video capability DTOs, hook call envelope | `@muse/plugin-host` (`packages/plugin-host`) | `packages/plugin-host/src/contract.ts` |

Muse Studio imports these workspace packages (`file:` dependencies + `transpilePackages` in `next.config.ts`) and exposes thin re-exports under `muse-studio/lib/plugin-extension/*` for stable `@/` imports. Those files **must not** duplicate schemas—only re-export from the packages above.

**Build / tooling notes (contributors):**

- Production and dev scripts use **`next build --webpack`** / **`next dev --webpack`** so webpack resolves `@muse/*` from `muse-studio/node_modules` and nested deps (Turbopack + Windows has known gaps for this layout).
- Run **`npm install` inside `packages/plugin-sdk`** once so `zod` exists next to the SDK sources when the bundler follows `file:` links into `packages/`.

### How these sections connect

To build a working plugin, follow this order:

1. **Read “Required Packages and Why”**  
   Understand that:
   - `packages/plugin-sdk` = manifest/install contract
   - `packages/plugin-host` = runtime generation contract
2. **Use “Manifest File: plugin.manifest.json”**  
   Define your plugin metadata, service URL, hooks, permissions, and compatibility.
3. **Use “Canonical Capability Payloads (Image + Video)”**  
   Implement your endpoint handlers to accept and return the exact payload shapes.
4. **Use “Reference Plugin Project Structure”**  
   Organize your plugin repo so Muse can install and call it consistently.
5. **Run “End-to-End Verification Checklist”**  
   Validate installation, health, provider selection in UI, generation, and output attachment.

## 1. Plugin MVP Model

- Plugin code runs **outside** Muse Studio (Muse calls it over HTTP).
- Muse Studio stores the plugin’s manifest + enabled state in SQLite.
- Plugins declare:
  - one or more **hooks** (capabilities Muse can call)
  - optional **UI extensions** (frontend bundles Muse displays in a sandboxed iframe)

## 2. Repository Requirements

Your plugin repo must contain a file named:

- `plugin.manifest.json`

Muse’s Plugin Manager (MVP) expects that file at the **repo root** for the ref it tries to install.

### What to paste in Muse Plugin Manager

You paste a GitHub URL like:

- `https://github.com/<owner>/<repo>`
- or `https://github.com/<owner>/<repo>/tree/<ref>`
- or `https://github.com/<owner>/<repo>/blob/<ref>`

Muse tries the provided ref, then falls back to `main` / `master`.

## 3. Manifest File: `plugin.manifest.json`

At a minimum your manifest must include:

- `id`, `name`, `version`
- `museApiVersion` (host compatibility; currently major must match)
- `service.baseUrl`
- `service.authScheme` (`none` or `bearer`)
- `hooks` (at least one capability)
- optional `uiExtensions`

### Example Manifest

```json
{
  "id": "my-company-comfyui-nodepack",
  "name": "My NodePack Extension",
  "version": "1.5.0",
  "author": "My Company",
  "description": "Adds image.generate support via an external service.",
  "museApiVersion": "1",
  "service": {
    "baseUrl": "http://localhost:8080",
    "healthPath": "/health",
    "authScheme": "none"
  },
  "permissions": ["media:generate"],
  "hooks": [
    {
      "capability": "image.generate",
      "method": "POST"
      // Optional:
      // "path": "/hooks/image.generate"
      // If omitted, host derives the path.
    }
  ],
  "uiExtensions": [
    {
      "slot": "settings.tab",
      "bundleUrl": "http://localhost:8081/ui/settings-tab.html"
      // Optional: "integrityHash"
    }
  ]
}
```

## 4. Hook Contract (Capability Endpoints)

### 4.1 Capability Names

The `hooks[].capability` value is a string like:

- `image.generate`
- `scene.generate`
- `video.generate`

Muse calls a hook by matching enabled plugins that declare the requested capability.

### 4.2 HTTP Method

- `hooks[].method` controls which HTTP method Muse uses.
- Default is `POST`.

### 4.3 HTTP Path

- If you specify `hooks[].path`, Muse will call that path.
- If you omit `path`, Muse will derive it with this MVP rule:
  - `/hooks/<url_encoded(capability)>`
  - for example `image.generate` becomes `/hooks/image.generate` (URL encoding is applied)

### 4.4 Request Headers (what Muse sends)

Muse sends:

- `content-type: application/json`
- `x-muse-capability: <capability>`
- `x-muse-request-id: <request id>`
- optionally: `x-muse-project-id: <projectId>` (only when a project-scoped call is used)

If your manifest sets `service.authScheme` to `"bearer"`:

- Muse may also send: `Authorization: Bearer <token>`
- In the current MVP, the token is resolved from an environment variable:
  - `MUSE_PLUGIN_BEARER_TOKEN_<PLUGIN_ID>` (plugin id uppercased, non-alnum replaced with `_`)

### 4.5 Request Body (what Muse sends)

Muse forwards the `input` object as the **raw JSON body**.

So your endpoint should expect the request body to be:

- the JSON value Muse provided as `input` (MVP does not wrap it)

### 4.6 Response (what Muse expects)

Return either:

- JSON with `Content-Type: application/json` (recommended), or
- plain text (Muse will pass it through as a string)

For JSON, return a JSON value (object/array/string), e.g.:

```json
{ "status": "ok", "result": { "url": "http://..." } }
```

## 5. Health Endpoint

Muse displays a health status by calling:

- `service.baseUrl + service.healthPath`

Defaults:

- `healthPath` defaults to `/health`

For example:

- baseUrl: `http://localhost:8080`
- healthPath: `/health`
- health URL called by Muse: `http://localhost:8080/health`

If it returns `2xx`, status becomes `healthy`; otherwise it becomes `unhealthy:<statusCode>` (timeout becomes `unhealthy:timeout`).

## 6. UI Extension Contract (Optional)

If your manifest includes `uiExtensions`, Muse will render them in an isolated sandboxed iframe.

### 6.1 Slots

`uiExtensions[].slot` is a string identifying where the UI should appear (MVP currently supports only a preview-like rendering).

### 6.2 Bundle URL

`uiExtensions[].bundleUrl` is loaded as the iframe `src`.

MVP sandbox settings:

- `sandbox="allow-scripts"`

### 6.3 postMessage Init

When the iframe loads, Muse sends an initialization message:

- `{ "type": "MUSE_UI_INIT", "pluginId": "<id>", "slot": "<slot>" }`

Your UI can listen for this message via `window.addEventListener('message', ...)`.

## 7. Practical Plugin Server Example (Minimal Pseudocode)

Your external service should expose:

- `GET /health` (or whatever `service.healthPath` sets)
- `POST /hooks/<capability>`

Example (conceptual):

```ts
app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/hooks/image.generate", (req, res) => {
  // req.body is the raw forwarded input JSON
  const input = req.body;
  // ... do work ...
  res.json({ ok: true, result: { /* ... */ } });
});
```

## 8. Debugging Tips

- If Muse cannot install your plugin, verify:
  - `plugin.manifest.json` exists at repo root
  - `museApiVersion` major matches the host (`"1"`)
  - `service.baseUrl` is reachable from the Muse machine
- If health shows `unhealthy`, verify:
  - health endpoint path exists
  - service is reachable
- If capability calls fail, verify:
  - hook capability name matches exactly
  - HTTP method matches `hooks[].method` (default POST)
  - endpoint path matches your manifest (or Muse’s derived rule)
  - response is valid JSON (if you return JSON)

## 9. MVP Limitations (Important)

- MVP calls only the **first enabled** plugin that declares a capability.
- Signature verification and strict UI bundle integrity checks are not enforced in MVP.
- Secrets handling is not implemented via `plugin_settings` yet; bearer tokens use the current env-var approach.

## 10. Canonical Capability Payloads (Image + Video)

Use these payloads as the stable contract for provider-mode integrations.

### 10.1 `image.generate` input

```json
{
  "projectId": "proj-001",
  "sceneId": "scene-001",
  "keyframeId": "kf-001",
  "sequenceOrder": 1,
  "prompt": "cinematic wide shot, blue hour, fog",
  "generationParams": {
    "denoiseStrength": 0.35,
    "styleStrength": 0.5,
    "aspectRatio": "16:9",
    "referenceWeight": 0.6
  },
  "referenceImages": [
    {
      "url": "/api/outputs/refs/char-001/look.png",
      "width": 1024,
      "height": 576
    }
  ],
  "pluginParams": {
    "rawInputs": {
      "prompt_node": "cinematic wide shot, blue hour, fog"
    }
  }
}
```

### 10.2 `image.generate` output

```json
{
  "finalImage": {
    "url": "https://plugin.example.com/outputs/img-123.png",
    "width": 1280,
    "height": 720,
    "alt": "Generated keyframe"
  },
  "draftImage": {
    "url": "https://plugin.example.com/outputs/img-123-draft.png"
  },
  "metadata": {
    "seed": 12345,
    "model": "wan-2.2-image"
  }
}
```

### 10.3 `video.generate` input

```json
{
  "projectId": "proj-001",
  "sceneId": "scene-001",
  "prompt": "slow dolly push-in, cinematic lighting",
  "sourceImages": [
    {
      "url": "/api/outputs/drafts/proj-001/library/shot-a.png",
      "width": 1280,
      "height": 720
    }
  ],
  "generationParams": {
    "durationSec": 4,
    "fps": 24,
    "aspectRatio": "16:9",
    "seed": 9876
  },
  "pluginParams": {
    "rawInputs": {
      "motion_strength": 0.7
    }
  }
}
```

### 10.4 `video.generate` output

```json
{
  "finalVideo": {
    "url": "https://plugin.example.com/outputs/vid-001.mp4",
    "durationSec": 4.0
  },
  "metadata": {
    "providerLatencyMs": 1820
  }
}
```

## 11. Reference Plugin Project Structure

Recommended folder layout:

```text
my-muse-plugin/
  plugin.manifest.json
  package.json
  src/
    server.ts
    routes/
      health.ts
      hooks.image-generate.ts
      hooks.video-generate.ts
```

### 11.1 TypeScript typing with `packages/plugin-host`

If your plugin code lives in this monorepo, import types directly:

```ts
import type {
  MuseImageGenerateInput,
  MuseImageGenerateOutput,
  MuseVideoGenerateInput,
  MuseVideoGenerateOutput,
} from "../../packages/plugin-host/src/contract";
```

If your plugin is in a separate repository, copy the type shapes from this document (or publish and consume a shared npm package in your own workflow).

### 11.2 Minimal typed handlers

```ts
app.post("/hooks/image.generate", (req, res) => {
  const input = req.body as MuseImageGenerateInput;
  const out: MuseImageGenerateOutput = {
    finalImage: { url: "https://plugin.example.com/outputs/img.png" },
  };
  res.json(out);
});

app.post("/hooks/video.generate", (req, res) => {
  const input = req.body as MuseVideoGenerateInput;
  const out: MuseVideoGenerateOutput = {
    finalVideo: { url: "https://plugin.example.com/outputs/vid.mp4" },
  };
  res.json(out);
});
```

### 11.3 Demo template in this repository

You can start from the included reference template:

- `packages/plugin-template-zimage-turbo/`

This template demonstrates:

- `plugin.manifest.json` setup for `image.generate`
- FastAPI service with:
  - `GET /health`
  - `POST /hooks/image.generate`
- Canonical payload parsing and response shaping
- Local output file hosting via `/assets/...`

It is modeled after the Z-Image Turbo provider style (`muse_backend/app/providers/image/zimage_provider.py`) but intentionally keeps inference as a demo/stub so developers can replace the adapter with their own real pipeline.

## 12. Where Plugins Appear in Muse UI

Plugins are shown in two categories:

- **Settings management**
  - `Settings -> Plugins` for install, enable/disable, update, delete, health checks.
- **Provider usage in generation flows**
  - `Playground` supports provider selection: `ComfyUI` or `Plugin`.
  - `Kanban scene generation dialog` supports provider selection: `ComfyUI` or `Plugin`.

For provider mode, Muse lists enabled plugins by capability:

- image mode -> plugins with `image.generate`
- video mode -> plugins with `video.generate`

## 13. Provider Selection and API Flow

When plugin provider is selected:

1. Frontend asks for providers by capability:
   - `GET /api/plugins/providers?capability=image.generate`
   - `GET /api/plugins/providers?capability=video.generate`
2. Frontend submits generation request to:
   - `POST /api/generate/plugin-provider`
3. Backend calls the selected plugin capability endpoint and normalizes output to `outputs/...`.
4. Frontend receives:
   - `output_path` (relative under `outputs`)
   - `output_url` (`/api/outputs/<output_path>`)

## 14. Output URL/Path Handling Rules

Your plugin may return `finalImage.url` / `finalVideo.url` in one of these forms:

- **HTTP(S) URL** (recommended for remote plugin runtimes)
  - Muse downloads and stores a copy under `outputs/...`.
- **`/api/outputs/...` URL**
  - Muse copies from its local outputs tree.
- **outputs-relative path**
  - Muse treats it as already inside outputs and copies it.

This guarantees stable media paths for project libraries and scene attachments.

## 15. Fallback Behavior (Current UX)

If plugin provider generation fails in UI and a ComfyUI workflow is available:

- Playground and Kanban dialogs may automatically fallback to ComfyUI (best-effort).
- The plugin error is surfaced to user contextually.

Plugin developers should still return clear error messages on non-2xx responses to help debugging.

## 16. End-to-End Verification Checklist

Use this checklist when validating your plugin:

1. Install plugin from GitHub in `Settings -> Plugins`.
2. Enable plugin and confirm health is `healthy`.
3. Open Playground:
   - choose `Image` or `Video`
   - switch provider to `Plugin`
   - verify your plugin appears in provider dropdown.
4. Generate media and verify:
   - response preview renders in UI
   - `output_path` exists under `outputs/...`
5. Repeat in Kanban generation dialog.
6. For image flow, save as keyframe and confirm it appears in scene state.
7. For video flow, confirm scene video URL updates and review status is set.

## 17. Plugin Runtime Strategy (Storage + Isolation)

This section defines how Muse should run plugin services at scale without forcing one full Python environment per plugin.

### 17.1 Goals

The plugin runtime should:

- minimize per-plugin storage overhead,
- avoid dependency conflicts that can break other plugins,
- preserve plugin isolation where needed,
- keep install/update UX simple for end users.

### 17.2 Recommended Model: Hybrid Runtime

Use a hybrid strategy:

- **Shared runtime (default)**  
  One common Python runtime for most plugins.
- **Isolated runtime (advanced/opt-in)**  
  Dedicated runtime only for plugins with dependency conflicts or special native requirements.

This avoids the cost of creating 100 independent venv folders while preserving an escape hatch for incompatible plugins.

### 17.3 Runtime Tiers

#### Tier A — Shared Runtime (default)

- Lowest disk usage.
- Fastest install path.
- Best for plugins using common dependency sets.

#### Tier B — Isolated Runtime (advanced)

- Strong dependency isolation.
- Higher disk usage.
- Best for plugins requiring conflicting dependency versions, specialized CUDA/native libs, or strict enterprise isolation.

### 17.4 Install-time Policy

At plugin install/update:

1. Validate `plugin.manifest.json`.
2. Resolve plugin dependency requirements.
3. Attempt install in **shared runtime** first.
4. If conflicts are detected:
   - show conflict summary to user,
   - offer **Install in isolated runtime**.
5. Persist runtime mode in plugin metadata.

### 17.5 Storage Strategy

To prevent runtime bloat:

- keep a global package/wheel cache,
- reuse downloaded artifacts across runtime installs,
- prune stale caches/runtimes periodically,
- display per-plugin disk impact in Plugin Manager.

### 17.6 Recommended Metadata Per Plugin

Store runtime metadata such as:

- `runtime_mode`: `shared` | `isolated`
- `runtime_id`
- `python_version`
- `resolved_dependencies_hash`
- `install_size_mb`
- `last_health_status`
- `last_start_error`

### 17.7 Security and Reliability Guidance

Regardless of runtime mode:

- keep plugin process external to core Muse processes,
- enforce capability-scoped calls (`image.generate`, `video.generate`, etc.),
- inject secrets/tokens via controlled runtime env policy,
- ensure one plugin runtime failure does not crash other plugins.

### 17.8 Plugin Manager UX Recommendations

Expose runtime choices during install:

- `Shared runtime (recommended)`
- `Isolated runtime (advanced)`

Also show:

- estimated disk impact,
- dependency conflict warnings,
- one-click remediation path (“move to isolated runtime”).

### 17.9 Suggested Defaults

For practical rollout:

- default to **shared runtime**,
- only offer isolated runtime when conflict detected,
- keep artifact cache enabled by default,
- provide optional cleanup controls for power users.

