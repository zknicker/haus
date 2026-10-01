import { useAgent } from '../../hooks/members/use-agent.ts';
import type { AgentTab } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { AgentProfileView } from '../members/agent-profile/agent-profile-view.tsx';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';

/**
 * An Agent profile tab's body, in the side pane or full width. Drill-down stays inside
 * the tab as its section. Blank while the Agent loads; the always-mounted tab
 * (`AgentWorkspaceTab`) closes a deleted or missing Agent's tab.
 */
export function AgentWorkspacePage({ tab }: { tab: AgentTab }) {
    const workspace = useBrowserWorkspace();
    const agent = useAgent(workspace?.serverId ?? '', tab.agentId);
    const { agentId } = tab;
    if (!(workspace && agent.data)) {
        return null;
    }
    return (
        <AgentProfileView
            agent={agent.data}
            onDeleted={() => workspace.closeTab({ kind: 'agent', agentId }, { remember: false })}
            onSectionChange={(section) => workspace.setAgentSection(agentId, section)}
            section={tab.section}
            server={workspace.server}
        />
    );
}
