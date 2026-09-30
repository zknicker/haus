import * as React from 'react';
import { opensInWorkspaceTab } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { useBrowserWorkspace } from '../shell/browser-workspace-context.tsx';
import { bindWorkspaceTargetToAgent, type HausResourceTarget } from './haus-resource-link.ts';

/** Opens a linked artifact; `title` is the artifact's authored title when the opener has one. */
type ArtifactOpen = (target: HausResourceTarget, title?: string) => void;

const ArtifactPanelContext = React.createContext<ArtifactOpen | null>(null);

/**
 * Routes artifact opens from message content. Desktop workspace tabs open the
 * artifact as its own tab; everywhere else it opens in the chat's Artifact Panel.
 */
export function ArtifactPanelOpenProvider({
    agentId,
    children,
    onOpen,
}: {
    agentId?: string;
    children: React.ReactNode;
    onOpen: (target: HausResourceTarget) => void;
}) {
    const openArtifactTab = useBrowserWorkspace()?.openArtifact;
    const open = React.useCallback<ArtifactOpen>(
        (target, title) => {
            const bound = bindWorkspaceTargetToAgent(target, agentId);
            const workspaceTabs = Boolean(openArtifactTab && getDesktopBridge()?.browserCommand);
            if (openArtifactTab && opensInWorkspaceTab(bound, workspaceTabs)) {
                openArtifactTab(bound, title);
            } else {
                onOpen(bound);
            }
        },
        [agentId, onOpen, openArtifactTab]
    );
    return <ArtifactPanelContext.Provider value={open}>{children}</ArtifactPanelContext.Provider>;
}

export function useArtifactPanelOpen() {
    return React.useContext(ArtifactPanelContext);
}
