# Muse Plugin Extension System (MVP -> Hardening)

## What this MVP delivers
1. **Plugin manifest contract** (`plugin.manifest.json`)
   - Typed schema lives in `packages/plugin-sdk`.
   - Host compatibility checks: `museApiVersion` major must match.
2. **Control-plane storage (SQLite)**
   - New tables added in `muse-studio/db/index.ts`:
     - `plugins`
     - `plugin_endpoints`
     - `plugin_hooks`
     - `plugin_ui_extensions`
     - `plugin_settings` (placeholder for future secrets)
3. **Plugin Manager UI**
   - New page: `muse-studio/app/settings/plugins/page.tsx`
   - Supported actions (MVP):
     - Add plugin by GitHub URL (expects `plugin.manifest.json` at repo root for the provided ref)
     - Enable / Disable
     - Delete
     - Manual health check refresh
     - View manifest + declared hooks/UI extensions
4. **Runtime capability call endpoint**
   - API: `muse-studio/app/api/plugins/call/route.ts`
   - Host contract implemented in:
     - `muse-studio/lib/actions/plugins.ts` (`callEnabledPluginsForCapability`)
   - MVP behavior: deterministically calls the first enabled plugin that declares the capability.

## Test plan (manual, recommended)
### Install happy path
1. Start Muse Studio UI.
2. Go to **Settings -> Plugins**.
3. Paste a GitHub repo URL containing `plugin.manifest.json` with:
   - `id`, `name`, `version`
   - `museApiVersion` with major `1`
   - `service.baseUrl` and `service.healthPath` (or accept default `/health`)
   - at least one hook in `hooks[]` with `capability` set (e.g. `image.generate`)
4. Click **Add Plugin**.
5. Confirm it appears in the list with a health status.

### Enable/disable behavior
1. Toggle Enable off.
2. Verify the plugin is no longer the selected provider for that capability (capability call returns “no enabled plugin”).
3. Toggle Enable on and verify capability calls route to it again.

### Capability call sanity
1. POST to `/api/plugins/call` with:
   - `capability`: the manifest hook capability
   - `input`: an arbitrary JSON object
2. Ensure the plugin endpoint receives the request and returns JSON.

## Hardening work (Phase 3+)
1. **Signature verification**
   - Require signed manifests (publisher key or GitHub release signature).
   - Verify `integrityHash` for UI extension bundles.
2. **Auth + project scoping**
   - Introduce project-scoped signed tokens for plugin calls.
   - Support stronger auth schemes (API key/bearer, OAuth, etc.).
3. **Resilience**
   - Retry policy, circuit breaker, and clearer error taxonomy.
4. **UI extensions routing**
   - Slot registry and host-side feature flags.
   - Improved isolation: stricter sandbox flags + optional bundle integrity enforcement.
5. **Marketplace / discovery**
   - Plugin metadata index and curated listings (not just raw GitHub URLs).

