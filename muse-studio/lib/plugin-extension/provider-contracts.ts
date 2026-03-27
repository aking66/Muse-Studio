/**
 * Re-exports capability DTO types from `@muse/plugin-host`.
 * Do not duplicate types here — edit `packages/plugin-host/src/contract.ts` instead.
 */
export type {
  MuseImageGenerateInput,
  MuseImageGenerateOutput,
  MuseVideoGenerateInput,
  MuseVideoGenerateOutput,
  PluginHookCallRequest,
  PluginHookCallResponse,
} from '@muse/plugin-host';
