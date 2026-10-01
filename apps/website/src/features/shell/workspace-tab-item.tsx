import type { WorkspaceTabRef } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { AgentWorkspaceTab } from './agent-workspace-tab.tsx';
import { ArtifactWorkspaceTab } from './artifact-workspace-tab.tsx';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { BrowserWorkspaceTab } from './browser-workspace-tab.tsx';
import { PrimaryWorkspaceTab } from './primary-workspace-tab.tsx';
import { ThreadWorkspaceTab } from './thread-workspace-tab.tsx';

/** One tab of any kind, in any strip or the open-tabs list; renders nothing for a tab that is gone. */
export function WorkspaceTabItem({ tabRef }: { tabRef: WorkspaceTabRef }) {
    const workspace = useBrowserWorkspace();
    if (!workspace) {
        return null;
    }
    switch (tabRef.kind) {
        case 'primary':
            return <PrimaryWorkspaceTab />;
        case 'browser': {
            const tab = workspace.state.tabs.find((item) => item.id === tabRef.id);
            return tab ? <BrowserWorkspaceTab tab={tab} /> : null;
        }
        case 'artifact': {
            const tab = workspace.artifacts.find((item) => item.key === tabRef.key);
            return tab ? <ArtifactWorkspaceTab tab={tab} /> : null;
        }
        case 'agent':
            return <AgentWorkspaceTab agentId={tabRef.agentId} />;
        case 'thread':
            return <ThreadWorkspaceTab tabRef={tabRef} />;
    }
}
