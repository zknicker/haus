import { useDeferredValue, useState } from 'react';
import { serverRoute } from '../servers/server-routes.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { PageTopbar } from '../shell/shell-topbar.tsx';
import { artifactFolderLabel } from './artifact-creators.ts';
import { ArtifactFiles } from './artifact-files.tsx';
import { ArtifactFolderRow } from './artifact-folder-row.tsx';
import { ArtifactLibraryControls } from './artifact-library-controls.tsx';
import { ArtifactsTopbar } from './artifacts-topbar.tsx';
import { useArtifactLibraryLayout } from './library-layout.ts';
import { useArtifactLibraryParams } from './library-params.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

/**
 * The Server's shared files as a Finder-style library: creator folders, then
 * every file in the open folder grouped by date. The band carries where you
 * are and every control; the column below is only content. Folder and kind
 * ride the URL; search stays local to the page.
 */
export function ArtifactLibrary({ serverId, slug }: { serverId: string; slug: string }) {
    const params = useArtifactLibraryParams();
    const layout = useArtifactLibraryLayout();
    const directory = useArtifactCreatorDirectory(serverId);
    const [search, setSearch] = useState('');
    const query = useDeferredValue(search);
    const kindQuery = params.kind === 'all' ? '' : `?kind=${params.kind}`;

    return (
        <>
            <PageTopbar>
                <ArtifactsTopbar
                    current={
                        params.creator ? artifactFolderLabel(params.creator, directory) : undefined
                    }
                    libraryHref={`${serverRoute(slug)}/artifacts${kindQuery}`}
                    slug={slug}
                >
                    <ArtifactLibraryControls
                        kind={params.kind}
                        onKindChange={params.selectKind}
                        onSearchChange={setSearch}
                        search={search}
                    />
                </ArtifactsTopbar>
            </PageTopbar>
            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                <PageColumn className="artifact-library @container gap-6 pt-4">
                    <ArtifactFolderRow
                        onSelect={params.selectCreator}
                        selected={params.creator}
                        serverId={serverId}
                    />
                    <ArtifactFiles
                        filters={{ creator: params.creator, kind: params.kind, query }}
                        layout={layout}
                        serverId={serverId}
                        slug={slug}
                    />
                </PageColumn>
            </div>
        </>
    );
}
