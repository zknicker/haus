import type { ArtifactMetadata } from '@haus/api';
import { Button } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import type { ArtifactLibrary } from '../../hooks/artifacts/use-artifact-library.ts';
import { useViewerTimeZone } from '../../hooks/members/use-viewer-time-zone.ts';
import { groupArtifactsByDate } from './artifact-date-groups.ts';
import { ArtifactFileGrid } from './artifact-file-grid.tsx';
import { ArtifactFileList, type ArtifactRow } from './artifact-file-list.tsx';
import { artifactKindLabel, artifactPath, artifactTimeLabel } from './artifact-format.ts';
import { artifactFolderWithin } from './drive-folders.ts';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import type { ArtifactLibraryLayout } from './library-layout.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

/**
 * The open folder's own files (or, while searching, every match under it),
 * grouped by when they last changed. Rows name the file; a title that
 * differs from the name, and a search hit's folder, lead the meta line.
 */
export function ArtifactFiles({
    artifacts,
    folder,
    layout,
    library,
    serverId,
    slug,
}: {
    artifacts: readonly ArtifactMetadata[];
    folder: string;
    layout: ArtifactLibraryLayout;
    library: Pick<ArtifactLibrary, 'hasMore' | 'isFetchingMore' | 'loadMore' | 'publicLinks'>;
    serverId: string;
    slug: string;
}) {
    const navigate = useNavigate();
    const directory = useArtifactCreatorDirectory(serverId);
    const timeZone = useViewerTimeZone(serverId);
    const now = useRelativeNow(60_000);
    const open = (artifact: ArtifactMetadata) => navigate(artifactPath(slug, artifact.artifact_id));
    const Collection = layout === 'grid' ? ArtifactFileGrid : ArtifactFileList;
    const rowFor = (artifact: ArtifactMetadata): ArtifactRow => ({
        artifact,
        meta: [
            artifact.title === artifact.filename ? null : artifact.title,
            artifactFolderWithin(artifact.path, folder) || null,
            artifactKindLabel(artifactFileKind(artifact)),
            directory.name(artifact.creator),
            artifactTimeLabel(artifact.updated_at, now),
        ]
            .filter(Boolean)
            .join(' · '),
        publicLink: library.publicLinks[artifact.artifact_id] ?? null,
    });

    return (
        <section aria-label="Files" className="flex flex-col gap-5">
            {groupArtifactsByDate(artifacts, now, timeZone).map((group) => (
                <section aria-label={group.label} className="flex flex-col gap-1" key={group.key}>
                    <h2 className="artifact-group-label">{group.label}</h2>
                    <Collection
                        label={group.label}
                        onOpen={open}
                        rows={group.artifacts.map(rowFor)}
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
