export const HOST_MUSE_API_VERSION = '1';
// MVP: keep host version conservative; Phase 3 can switch to semver/real package version.
export const HOST_MUSE_VERSION = '0.1.0';

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

