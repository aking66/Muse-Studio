# `@muse/plugin-sdk`

**Canonical source of truth** for Muse plugin `plugin.manifest.json` validation (Zod schemas) and related helpers (`parsePluginManifest`, compatibility checks).

- Consumed by **Muse Studio** via `file:../packages/plugin-sdk` (see `muse-studio/package.json`).
- Plugin templates and external repos should copy or depend on this package; do not fork the schema into the host app.

See root `PlugIns Development Documentation.md` for the full contract and sync policy.
