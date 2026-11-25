import { lazy, Suspense } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { driveRootLabel } from '../../features/artifacts/drive-places.ts';
import { driveWorkspaceRoot } from '../../features/artifacts/drive-tree-model.ts';
import { parseLibrarySearch } from '../../features/artifacts/library-params.ts';
import { useServerContext } from '../../features/servers/server-context.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { parseArtifactPageKey } from './desktop-page-paths.ts';
import { serverRouteModules } from './server-route-modules.ts';

const ArtifactLibrary = lazy(async () => ({
    default: (await serverRouteModules.artifacts()).ArtifactLibrary,
}));
const DriveWorkspace = lazy(async () => ({
    default: (await import('../../features/artifacts/drive-workspace.tsx')).DriveWorkspace,
}));
const WorkspaceArtifact = lazy(async () => ({
    default: (await import('./artifact-page-route.tsx')).ArtifactPageRoute,
}));

/**
 * `artifacts` is Drive, the shared library; `artifacts/<id>` one shared file.
 * The Drive root is a full-page list; every folder below it and every file
 * open in one workspace that keeps the tree mounted between them. A workspace target key (`workspaceFile:<agent>:<path>`) is a desktop
 * artifact page from an Agent's workspace instead.
 */
export function SharedArtifactsPage() {
    const { server } = useServerContext();
    const { artifactKey } = useParams();
    const [params] = useSearchParams();
    const workspacePage = artifactKey ? parseArtifactPageKey(artifactKey) !== null : false;
    useWindowTitle(workspacePage ? 'Workspace' : driveRootLabel);
    if (workspacePage) {
        return (
            <Suspense fallback={null}>
                <WorkspaceArtifact />
            </Suspense>
        );
    }
    const inWorkspace = driveWorkspaceRoot(parseLibrarySearch(params).folder) !== null;
    return (
        <section aria-label={driveRootLabel} className="flex min-h-0 flex-1 flex-col">
            <Suspense fallback={null}>
                {artifactKey || inWorkspace ? (
                    <DriveWorkspace
                        artifactId={artifactKey ?? null}
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
