import * as React from 'react';
import { getArtifactPanelTargetKey } from '../../features/chats/haus-resource-link.ts';
import type { AgentSection } from '../../features/members/agent-profile/agent-sections.ts';
import {
    type AppTabRef,
    openGroup,
    type TabPlacement,
    type WorkspaceArtifactTarget,
    type WorkspaceTabsState,
} from './workspace-tabs-model.ts';
import type { AppTabInput, WorkspaceTabsAction } from './workspace-tabs-reducer.ts';

export interface WorkspaceTabOpeners {
    openAgent: (
        agentId: string,
        options?: { placement?: TabPlacement; section?: AgentSection }
    ) => void;
    openArtifact: (
        target: WorkspaceArtifactTarget,
        title?: string,
        placement?: TabPlacement
    ) => void;
    /** Opens a Thread as a companion: the split's preview tab, unless `main` forces the main strip. */
    openThread: (
        chatId: string,
        anchorMessageId: string,
        options?: { placement?: TabPlacement }
    ) => void;
}

/**
 * Opens or selects App-local tabs by the routing rule. A tab landing in the
 * main strip releases Electron's browser selection so the tab shows.
 */
export function useWorkspaceTabOpeners({
    dispatch,
    latest,
    releaseBrowser,
}: {
    dispatch: React.Dispatch<WorkspaceTabsAction>;
    latest: React.RefObject<{ source: string | null; state: WorkspaceTabsState }>;
    releaseBrowser: () => void;
}) {
    const open = React.useCallback(
        (input: AppTabInput, ref: AppTabRef, placement: TabPlacement) => {
            const group = openGroup(latest.current.state, ref, placement);
            dispatch({ kind: 'open', placement, tab: input });
            if (group === 'main') {
                releaseBrowser();
            }
        },
        [dispatch, latest, releaseBrowser]
    );
    const openArtifact = React.useCallback<WorkspaceTabOpeners['openArtifact']>(
        (target, title, placement = 'auto') => {
            const input: AppTabInput = {
                kind: 'artifact',
                source: latest.current.source,
                target,
                title: title ?? null,
            };
            open(input, { kind: 'artifact', key: getArtifactPanelTargetKey(target) }, placement);
        },
        [latest, open]
    );
    const openAgent = React.useCallback<WorkspaceTabOpeners['openAgent']>(
        (agentId, options = {}) => {
            const input: AppTabInput = { kind: 'agent', agentId, section: options.section };
            open(input, { kind: 'agent', agentId }, options.placement ?? 'auto');
        },
        [open]
    );
    const openThread = React.useCallback<WorkspaceTabOpeners['openThread']>(
        (chatId, anchorMessageId, options = {}) => {
            const ref = { kind: 'thread', anchorMessageId, chatId } as const;
            open(ref, ref, options.placement ?? 'auto');
        },
        [open]
    );
    return { open, openAgent, openArtifact, openThread };
}
