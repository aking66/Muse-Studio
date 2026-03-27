export { HOST_MUSE_API_VERSION } from '@muse/plugin-host';
// MVP: keep host version conservative; Phase 3 can switch to semver/real package version.
export const HOST_MUSE_VERSION = '1.5.0';

export interface PluginSummary {
  id: string;
  name: string;
  version: string;
  sourceUrl: string;
  enabled: boolean;
  status: string;
  healthStatus: string;
  lastHealthAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

