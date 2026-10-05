import { toast } from '@heroui/react';
import * as React from 'react';
import { useDesktopPageOpeners } from '../../hooks/desktop-tabs/use-desktop-page-openers.ts';
import type { ArtifactPageTarget } from '../../routes/app/desktop-page-paths.ts';
import { bindWorkspaceTargetToAgent, type HausResourceTarget } from './haus-resource-link.ts';

/** Opens a linked artifact; `title` is the artifact's authored title when the opener has one. */
type ArtifactOpen = (target: HausResourceTarget, title?: string) => void;

const ArtifactPanelContext = React.createContext<ArtifactOpen | null>(null);

/**
 * Routes artifact opens from message content. Desktop opens the artifact as
 * its own page (ADR 0039); desktop has no chat Artifact Panel, so a target no
 * Agent workspace holds says it is unavailable there. The website opens it in
 * the chat's Artifact Panel.
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
    const openArtifactTab = useDesktopPageOpeners()?.openArtifact;
    const open = React.useCallback<ArtifactOpen>(
        (target, title) => {
            const bound = bindWorkspaceTargetToAgent(target, agentId);
            routeArtifactOpen(bound, title, { onOpen, openArtifactTab });
        },
        [agentId, onOpen, openArtifactTab]
    );
    return <ArtifactPanelContext.Provider value={open}>{children}</ArtifactPanelContext.Provider>;
}

export function useArtifactPanelOpen() {
    return React.useContext(ArtifactPanelContext);
}

/** Desktop (an `openArtifactTab`): a tab, or an unavailable notice. Website: the chat's Artifact Panel. */
export function routeArtifactOpen(
    target: HausResourceTarget,
    title: string | undefined,
    {
        onOpen,
        onUnavailable,
        openArtifactTab,
    }: {
        onOpen: (target: HausResourceTarget) => void;
        onUnavailable?: () => void;
        openArtifactTab: DesktopArtifactOpen | undefined;
    }
) {
    if (openArtifactTab) {
        openDesktopArtifact(target, title, { onUnavailable, openArtifactTab });
    } else {
        onOpen(target);
    }
}

/** Desktop has no chat Artifact Panel: an artifact no Agent workspace holds cannot open. */
export function openDesktopArtifact(
    target: HausResourceTarget,
    title: string | undefined,
    {
        onUnavailable = showArtifactUnavailable,
        openArtifactTab,
    }: { onUnavailable?: () => void; openArtifactTab: DesktopArtifactOpen }
) {
    const agentId = 'agentId' in target ? target.agentId : undefined;
    if (agentId) {
        openArtifactTab({ ...target, agentId }, title);
    } else {
        onUnavailable();
    }
}

type DesktopArtifactOpen = (target: ArtifactPageTarget, title?: string) => void;

function showArtifactUnavailable() {
    toast.danger('Artifact unavailable', {
        description: 'Only files in an Agent’s workspace open as tabs.',
    });
}
