import type { ArtifactPublicLink, ArtifactRecord } from '@haus/api';
import { GridListHeader, GridListSection } from 'react-aria-components';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { useViewerTimeZone } from '../../hooks/members/use-viewer-time-zone.ts';
import { groupArtifactsByDate } from './artifact-date-groups.ts';
import { ArtifactFileTile } from './artifact-file-grid.tsx';
import { ArtifactFileRow } from './artifact-file-list.tsx';
import { artifactKindLabel, artifactTimeLabel } from './artifact-format.ts';
import type { ArtifactRow } from './artifact-row-meta.tsx';
import { artifactFolderWithin } from './drive-folders.ts';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import type { ArtifactLibraryLayout } from './library-layout.ts';
import { useArtifactLibrarySort } from './library-sort.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

/** One run of files the library draws together: a date group, or every file in one run. */
export interface ArtifactFileRun {
    key: string;
    /** The date group's label; empty for the single run of a non-date sort. */
    label: string;
    rows: ArtifactRow[];
}

/**
 * The open folder's own files (or, while searching, every match under it) in
 * the viewer's sort, as runs. Sorted by Modified they group by when they last
 * changed; any other sort is one run. Rows name the file; a title that differs
 * from the name, and a search hit's folder (a link there), lead the meta line,
 * then who last changed it.
 */
export function useArtifactFileRuns(input: {
    artifacts: readonly ArtifactRecord[];
    folder: string;
    /** Where a search hit's folder link goes, and what it does on the way. */
    onShowFolder: (artifact: ArtifactRecord) => { href: string; onOpen: () => void };
    publicLinks: Readonly<Record<string, ArtifactPublicLink>>;
    serverId: string;
}): ArtifactFileRun[] {
    const directory = useArtifactCreatorDirectory(input.serverId);
    const timeZone = useViewerTimeZone(input.serverId);
    const sort = useArtifactLibrarySort();
    const now = useRelativeNow(60_000);
    const rowFor = (artifact: ArtifactRecord): ArtifactRow => {
        const within = artifactFolderWithin(artifact.path, input.folder);
        return {
            artifact,
            facts: {
                author: directory.name(artifact.author),
                folder: within ? { label: within, ...input.onShowFolder(artifact) } : null,
                kind: artifactKindLabel(artifactFileKind(artifact)),
                time: artifactTimeLabel(artifact.updated_at, now),
                title: artifact.title === artifact.filename ? null : artifact.title,
            },
            publicLink: input.publicLinks[artifact.artifact_id] ?? null,
        };
    };
    const runs =
        sort.by === 'modified'
            ? groupArtifactsByDate(input.artifacts, now, timeZone)
            : [{ artifacts: [...input.artifacts], key: 'all', label: '' }];
    return runs.map((run) => ({ key: run.key, label: run.label, rows: run.artifacts.map(rowFor) }));
}

/**
 * One run as a section of the library's collection, under its date label:
 * ListView rows in the list, stock Card tiles in the grid.
 */
export function ArtifactFileSection({
    layout,
    onOpen,
    run,
    serverId,
}: {
    layout: ArtifactLibraryLayout;
    onOpen: (artifact: ArtifactRecord) => void;
    run: ArtifactFileRun;
    serverId: string;
}) {
    const Item = layout === 'grid' ? ArtifactFileTile : ArtifactFileRow;
    return (
        <GridListSection
            // A date run is named by its label header; the single run of other sorts by this.
            aria-label={run.label ? undefined : 'All files'}
            className={layout === 'grid' ? 'artifact-file-grid' : 'artifact-file-run'}
            id={`files-${run.key}`}
        >
            {run.label ? (
                <GridListHeader className="artifact-group-label">{run.label}</GridListHeader>
            ) : null}
            {run.rows.map((row) => (
                <Item
                    key={row.artifact.artifact_id}
                    onOpen={() => onOpen(row.artifact)}
                    row={row}
                    serverId={serverId}
                />
            ))}
        </GridListSection>
    );
}
