import type { ArtifactMetadata, ArtifactRecord } from '@haus/api';
import { Button } from '@heroui/react';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import type { ArtifactLibrary } from '../../hooks/artifacts/use-artifact-library.ts';
import { useViewerTimeZone } from '../../hooks/members/use-viewer-time-zone.ts';
import { useArtifactActionsContext } from './artifact-actions-context.ts';
import { groupArtifactsByDate } from './artifact-date-groups.ts';
import { ArtifactFileGrid } from './artifact-file-grid.tsx';
import { ArtifactFileList } from './artifact-file-list.tsx';
import { artifactKindLabel, artifactTimeLabel } from './artifact-format.ts';
import { ArtifactListHeader } from './artifact-list-header.tsx';
import type { ArtifactRow } from './artifact-row-meta.tsx';
import { artifactFolderWithin } from './drive-folders.ts';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import type { ArtifactLibraryLayout } from './library-layout.ts';
import type { LibrarySelection } from './library-selection.ts';
import { useArtifactLibrarySort } from './library-sort.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

/**
 * The open folder's own files (or, while searching, every match under it) in
 * the viewer's sort. Sorted by Modified they group by when they last changed;
 * any other sort is one run. Rows name the file; a title that differs from
 * the name, and a search hit's folder (a link there), lead the meta line,
 * then who last changed it.
 */
export function ArtifactFiles({
    artifacts,
    folder,
    layout,
    library,
    onShowFolder,
    selection,
    serverId,
}: {
    artifacts: readonly ArtifactRecord[];
    folder: string;
    layout: ArtifactLibraryLayout;
    library: Pick<ArtifactLibrary, 'hasMore' | 'isFetchingMore' | 'loadMore' | 'publicLinks'>;
    /** Where a search hit's folder link goes, and what it does on the way. */
    onShowFolder: (artifact: ArtifactRecord) => { href: string; onOpen: () => void };
    selection: LibrarySelection;
    serverId: string;
}) {
    const actions = useArtifactActionsContext();
    const directory = useArtifactCreatorDirectory(serverId);
    const timeZone = useViewerTimeZone(serverId);
    const sort = useArtifactLibrarySort();
    const now = useRelativeNow(60_000);
    const open = (artifact: ArtifactMetadata) => actions.runFile('open', artifact);
    const Collection = layout === 'grid' ? ArtifactFileGrid : ArtifactFileList;
    const rowFor = (artifact: ArtifactRecord): ArtifactRow => {
        const within = artifactFolderWithin(artifact.path, folder);
        return {
            artifact,
            facts: {
                author: directory.name(artifact.author),
                folder: within ? { label: within, ...onShowFolder(artifact) } : null,
                kind: artifactKindLabel(artifactFileKind(artifact)),
                time: artifactTimeLabel(artifact.updated_at, now),
                title: artifact.title === artifact.filename ? null : artifact.title,
            },
            publicLink: library.publicLinks[artifact.artifact_id] ?? null,
        };
    };
    const runs =
        sort.by === 'modified'
            ? groupArtifactsByDate(artifacts, now, timeZone)
            : [{ artifacts: [...artifacts], key: 'all', label: '' }];

    return (
        <section aria-label="Files" className="flex flex-col gap-5">
            {layout === 'list' ? <ArtifactListHeader /> : null}
            {runs.map((run) => (
                <section
                    aria-label={run.label || 'Files'}
                    className="flex flex-col gap-1"
                    key={run.key}
                >
                    {run.label ? <h2 className="artifact-group-label">{run.label}</h2> : null}
                    <Collection
                        label={run.label || 'Files'}
                        onOpen={open}
                        rows={run.artifacts.map(rowFor)}
                        selection={selection}
                        serverId={serverId}
                    />
                </section>
            ))}
            {library.hasMore ? (
                <Button
                    className="self-center"
                    isPending={library.isFetchingMore}
                    onPress={library.loadMore}
                    size="sm"
                    variant="ghost"
                >
                    Show more
                </Button>
            ) : null}
        </section>
    );
}
