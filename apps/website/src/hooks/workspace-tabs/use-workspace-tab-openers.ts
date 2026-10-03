import * as React from 'react';
import type { AgentSection } from '../../features/members/agent-profile/agent-sections.ts';
import type { WorkspaceArtifactTarget } from './workspace-tabs-model.ts';
import type { AppTabInput, WorkspaceTabsAction } from './workspace-tabs-reducer.ts';

export interface WorkspaceTabOpeners {
    openAgent: (agentId: string, options?: { section?: AgentSection }) => void;
    openArtifact: (target: WorkspaceArtifactTarget, title?: string) => void;
    /** Opens a chat's Files tab. */
    openFiles: (chatId: string) => void;
    /** Opens a Thread as the preview tab, which the next opened Thread replaces. */
    openThread: (chatId: string, anchorMessageId: string) => void;
}

/**
 * Opens or selects App-local tabs. An opened tab is the selected closable tab
 * and shows (the side pane reveals, or the expanded strip selects it), so it
 * releases Electron's browser selection.
 */
export function useWorkspaceTabOpeners({
    dispatch,
    latest,
    releaseBrowser,
}: {
    dispatch: React.Dispatch<WorkspaceTabsAction>;
    latest: React.RefObject<{ source: string | null }>;
    releaseBrowser: () => void;
}) {
    const open = React.useCallback(
        (input: AppTabInput) => {
            dispatch({ kind: 'open', tab: input });
            releaseBrowser();
        },
        [dispatch, releaseBrowser]
    );
    const openArtifact = React.useCallback<WorkspaceTabOpeners['openArtifact']>(
        (target, title) =>
            open({ kind: 'artifact', source: latest.current.source, target, title: title ?? null }),
        [latest, open]
    );
    const openAgent = React.useCallback<WorkspaceTabOpeners['openAgent']>(
        (agentId, options = {}) => open({ kind: 'agent', agentId, section: options.section }),
        [open]
    );
    const openThread = React.useCallback<WorkspaceTabOpeners['openThread']>(
        (chatId, anchorMessageId) => open({ kind: 'thread', anchorMessageId, chatId }),
        [open]
    );
    const openFiles = React.useCallback<WorkspaceTabOpeners['openFiles']>(
        (chatId) => open({ kind: 'files', chatId }),
        [open]
    );
    return { open, openAgent, openArtifact, openFiles, openThread };
}
