import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { useServerContext } from '../../features/servers/server-context.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { parseArtifactPageKey } from './desktop-page-paths.ts';
import { serverRouteModules } from './server-route-modules.ts';

const ArtifactLibrary = lazy(async () => ({
    default: (await serverRouteModules.artifacts()).ArtifactLibrary,
}));
const ArtifactViewer = lazy(async () => ({
    default: (await import('../../features/artifacts/artifact-viewer.tsx')).ArtifactViewer,
}));
const WorkspaceArtifact = lazy(async () => ({
    default: (await import('./artifact-page-route.tsx')).ArtifactPageRoute,
}));

/**
 * `artifacts` is the shared library; `artifacts/<id>` one shared file. A
 * workspace target key (`workspaceFile:<agent>:<path>`) is a desktop artifact
 * page from an Agent's workspace instead.
 */
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
        <section aria-label="Artifacts" className="flex min-h-0 flex-1 flex-col">
            <Suspense fallback={null}>
                {artifactKey ? (
                    <ArtifactViewer
                        artifactId={artifactKey}
                        key={artifactKey}
                        serverId={server.id}
                        slug={server.slug}
                    />
                ) : (
                    <ArtifactLibrary serverId={server.id} slug={server.slug} />
                )}
            </Suspense>
        </section>
    );
}
