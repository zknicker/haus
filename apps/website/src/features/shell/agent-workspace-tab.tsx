import * as React from 'react';
import { useAgent } from '../../hooks/members/use-agent.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { ClosableWorkspaceTab } from './closable-workspace-tab.tsx';
import { AgentTabMark } from './workspace-tab-mark.tsx';

/**
 * An Agent profile tab: the Agent's name and avatar, blank while the Agent
 * loads. It stays mounted while unselected, so it closes itself once the
 * Agent is gone (deleted elsewhere, or a restored tab for a removed Agent).
 */
export function AgentWorkspaceTab({ agentId }: { agentId: string }) {
    const workspace = useBrowserWorkspace();
    const query = useAgent(workspace?.serverId ?? '', agentId);
    const agent = query.data;
    const missing = !agent && query.error?.data?.code === 'NOT_FOUND';
    const closeTab = workspace?.closeTab;
    React.useEffect(() => {
        if (missing) {
            closeTab?.({ kind: 'agent', agentId }, { remember: false });
        }
    }, [agentId, closeTab, missing]);
    const label = agent?.displayName ?? '';
    return (
        <ClosableWorkspaceTab
            label={label}
            mark={
                <AgentTabMark
                    agent={agent ? { avatarUrl: agent.avatarUrl, name: agent.displayName } : null}
                />
            }
            tabRef={{ kind: 'agent', agentId }}
            tooltip={label ? <p>{label}</p> : null}
        />
    );
}
