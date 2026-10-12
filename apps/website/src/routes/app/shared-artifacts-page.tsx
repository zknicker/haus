import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { useServerContext } from '../../features/servers/server-context.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { parseArtifactPageKey } from './desktop-page-paths.ts';

const ArtifactsContent = lazy(async () => ({
    default: (await import('../../features/artifacts/artifacts-content.tsx')).ArtifactsContent,
}));
const SharedArtifactContent = lazy(async () => ({
    default: (await import('../../features/artifacts/artifact-viewer.tsx')).SharedArtifactContent,
}));
const WorkspaceArtifact = lazy(async () => ({
    default: (await import('./artifact-page-route.tsx')).ArtifactPageRoute,
}));

export function SharedArtifactsPage() {
    const { server } = useServerContext();
    const { artifactKey } = useParams();
    useWindowTitle('Artifacts');
    if (artifactKey && parseArtifactPageKey(artifactKey)) {
        return (
            <Suspense fallback={null}>
                <WorkspaceArtifact />
            </Suspense>
        );
    }
    return (
        <Suspense fallback={null}>
            {artifactKey ? (
                <SharedArtifactContent
                    artifactId={artifactKey}
                    serverId={server.id}
                    slug={server.slug}
                />
            ) : (
                <ArtifactsContent serverId={server.id} slug={server.slug} />
            )}
        </Suspense>
    );
}
