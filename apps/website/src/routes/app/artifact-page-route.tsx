import { Toolbar } from '@heroui/react';
import { useParams } from 'react-router-dom';
import { ArtifactOptionsMenu } from '../../features/chats/chat-artifact-panel-chrome.tsx';
import { WorkspaceBrowserContent } from '../../features/chats/chat-artifact-workspace-content.tsx';
import {
    useWorkspaceArtifact,
    WorkspaceArtifactControls,
} from '../../features/chats/chat-artifact-workspace-file.tsx';
import {
    WorkspaceArtifactContent,
    WorkspaceArtifactEmpty,
} from '../../features/chats/chat-artifact-workspace-preview.tsx';
import type { HausResourceTarget } from '../../features/chats/haus-resource-link.ts';
import { useServerContext } from '../../features/servers/server-context.ts';
import { PageToolbar } from '../../features/shell/page-toolbar.tsx';
import { parseArtifactPageKey } from './desktop-page-paths.ts';

/**
 * An Agent's artifact as a desktop page (`artifacts/:artifactKey`, ADR 0039),
 * drawn with the Artifact Panel's own renderers: a file shows its preview, a
 * workspace folder shows the workspace browser.
 */
export function ArtifactPageRoute() {
    const { artifactKey = '' } = useParams();
    const { server } = useServerContext();
    const target = parseArtifactPageKey(artifactKey);
    if (!target) {
        return (
            <WorkspaceArtifactEmpty
                detail="This artifact address is not one Haus can open."
                title="Artifact unavailable"
            />
        );
    }
    return (
        <section aria-label="Artifact" className="flex min-h-0 flex-1 flex-col bg-background">
            {target.kind === 'workspaceFile' ? (
                <ArtifactFile agentId={target.agentId} serverId={server.id} target={target} />
            ) : (
                <WorkspaceBrowserContent
                    agentId={target.agentId}
                    initialDirectoryPath={target.path}
                    railVariant="sidebar"
                    serverId={server.id}
                    treeSide="start"
                />
            )}
        </section>
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
            <PageToolbar>
                <p className="min-w-0 flex-1 truncate ps-2 text-muted text-sm">{target.path}</p>
                <Toolbar aria-label="Artifact actions" className="shrink-0">
                    <WorkspaceArtifactControls artifact={artifact} />
                    <ArtifactOptionsMenu target={target} />
                </Toolbar>
            </PageToolbar>
            <div className="min-h-0 flex-1">
                <WorkspaceArtifactContent agentId={agentId} artifact={artifact} target={target} />
            </div>
        </>
    );
}
