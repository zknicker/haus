import type * as React from 'react';
import { useParams } from 'react-router-dom';
import { SharedArtifactScopeProvider } from './shared-artifact-scope.tsx';

/**
 * Cheap gate for a message that may link this Server's library, so the rest
 * of the transcript pays nothing: no route read, provider, or tile.
 */
export function mayLinkSharedArtifact(content: string) {
    return content.includes('/artifacts/art_');
}

/**
 * A message whose content links the shared library: its links read as in-app
 * references. The artifacts they name show as tiles in the message's media
 * strip, which the transcript's media renderer owns.
 */
export function MessageSharedArtifactScope({
    children,
    serverId,
}: {
    children: React.ReactNode;
    serverId: string;
}) {
    const { slug = '' } = useParams();
    return (
        <SharedArtifactScopeProvider serverId={serverId} slug={slug}>
            {children}
        </SharedArtifactScopeProvider>
    );
}
