import { Toolbar } from '@heroui/react';
import type { ArtifactTab } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { ArtifactOptionsMenu } from '../chats/chat-artifact-panel-chrome.tsx';
import { WorkspaceBrowserContent } from '../chats/chat-artifact-workspace-content.tsx';
import {
    useWorkspaceArtifact,
    WorkspaceArtifactControls,
} from '../chats/chat-artifact-workspace-file.tsx';
import {
    WorkspaceArtifactContent,
    WorkspaceArtifactEmpty,
} from '../chats/chat-artifact-workspace-preview.tsx';
import type { HausResourceTarget } from '../chats/haus-resource-link.ts';

/**
 * An artifact tab's body, in the side pane or full width. It renders in the DOM with the
 * Artifact Panel's own renderers: a file shows its preview, a workspace
 * folder shows the workspace browser.
 */
export function ArtifactWorkspacePage({ serverId, tab }: { serverId: string; tab: ArtifactTab }) {
    return <ArtifactPageContent serverId={serverId} tab={tab} />;
}

function ArtifactPageContent({ serverId, tab }: { serverId: string; tab: ArtifactTab }) {
    const { target } = tab;
    if (target.kind === 'workspaceFile') {
        return <ArtifactFile agentId={target.agentId} serverId={serverId} target={target} />;
    }
    return (
        <WorkspaceBrowserContent
            agentId={target.agentId}
            initialDirectoryPath={target.path}
            railVariant="sidebar"
            serverId={serverId}
            treeSide="start"
        />
    );
}

function ArtifactFile({
    agentId,
    serverId,
    target,
}: {
    agentId: string;
    serverId: string;
    target: Extract<HausResourceTarget, { kind: 'workspaceFile' }>;
}) {
    const artifact = useWorkspaceArtifact({ agentId, includeHidden: false, serverId, target });
    if (artifact.fileQuery.error) {
        return (
            <WorkspaceArtifactEmpty
                detail="This file was moved or deleted, or its workspace is offline."
                title="Artifact unavailable"
            />
        );
    }
    return (
        <>
            <header className="artifact-toolbar flex shrink-0 items-center gap-1.5 py-1.25 ps-4 pe-2">
                <p className="min-w-0 flex-1 truncate text-muted text-sm">{target.path}</p>
                <Toolbar aria-label="Artifact actions" className="shrink-0">
                    <WorkspaceArtifactControls artifact={artifact} />
                    <ArtifactOptionsMenu target={target} />
                </Toolbar>
            </header>
            <div className="min-h-0 flex-1">
                <WorkspaceArtifactContent agentId={agentId} artifact={artifact} target={target} />
            </div>
        </>
    );
}
