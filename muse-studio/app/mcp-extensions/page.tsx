import { AppHeader } from '@/components/layout/AppHeader';
import { McpExtensionsConsoleClient } from '@/components/mcp-extensions/McpExtensionsConsoleClient';
import { getMcpExtensionsChatInitialLines } from '@/lib/actions/mcpExtensionsChat';
import { listMcpExtensionsConsolePlugins, listMcpExtensionToolsForLlm } from '@/lib/actions/plugins';
import { getProjects } from '@/lib/actions/projects';
import type { ProjectStage } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function McpExtensionsConsolePage() {
  const [initialLines, projects, pluginGroups, toolCatalog] = await Promise.all([
    getMcpExtensionsChatInitialLines(),
    getProjects(),
    listMcpExtensionsConsolePlugins(),
    listMcpExtensionToolsForLlm(),
  ]);

  const projectSummaries = projects.map((p) => ({
    id: p.id,
    title: p.title,
    currentStage: p.currentStage as ProjectStage,
    logline: p.storyline?.logline,
  }));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader />
      <McpExtensionsConsoleClient
        initialLines={initialLines}
        projects={projectSummaries}
        initialPluginGroups={pluginGroups}
        toolCatalog={toolCatalog}
      />
    </div>
  );
}
