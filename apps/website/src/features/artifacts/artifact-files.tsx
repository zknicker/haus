import type { ArtifactMetadata } from '@haus/api';
import { Button } from '@heroui/react';
import { EmptyState } from '@heroui-pro/react';
import { FolderLibraryIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useNavigate } from 'react-router-dom';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import {
    type ArtifactLibraryFilters,
    useArtifactLibrary,
} from '../../hooks/artifacts/use-artifact-library.ts';
import { useViewerTimeZone } from '../../hooks/members/use-viewer-time-zone.ts';
import { groupArtifactsByDate } from './artifact-date-groups.ts';
import { ArtifactFileGrid } from './artifact-file-grid.tsx';
import { ArtifactFileList, type ArtifactRow } from './artifact-file-list.tsx';
import { artifactKindLabel, artifactPath, artifactTimeLabel } from './artifact-format.ts';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import type { ArtifactLibraryLayout } from './library-layout.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

/**
 * The library's files under the current folder, kind, and search, grouped by
 * when they last changed. Blank until the first read lands; the empty state
 * shows only for a real zero.
 */
export function ArtifactFiles({
    filters,
    layout,
    serverId,
    slug,
}: {
    filters: ArtifactLibraryFilters;
    layout: ArtifactLibraryLayout;
    serverId: string;
    slug: string;
}) {
    const navigate = useNavigate();
    const library = useArtifactLibrary(serverId, filters);
    const directory = useArtifactCreatorDirectory(serverId);
    const timeZone = useViewerTimeZone(serverId);
    const now = useRelativeNow(60_000);
    const filtered = Boolean(filters.creator || filters.query.trim() || filters.kind !== 'all');
    const artifacts = library.artifacts;
    const open = (artifact: ArtifactMetadata) => navigate(artifactPath(slug, artifact.artifact_id));
    const Collection = layout === 'grid' ? ArtifactFileGrid : ArtifactFileList;

    if (library.error) {
        return <p role="alert">{library.error.message}</p>;
    }
    if (!artifacts) {
        return <section aria-busy="true" aria-label="Loading files" className="min-h-32" />;
    }
    if (artifacts.length === 0 && !filtered) {
        return <LibraryEmptyState filtered={false} />;
    }
    const rowFor = (artifact: ArtifactMetadata): ArtifactRow => ({
        artifact,
        meta: [
            artifactKindLabel(artifactFileKind(artifact)),
            directory.name(artifact.creator),
            artifactTimeLabel(artifact.updated_at, now),
        ].join(' · '),
    });
    return (
        <section aria-label="Files" className="flex flex-col gap-5">
            {artifacts.length === 0 ? (
                <LibraryEmptyState filtered />
            ) : (
                groupArtifactsByDate(artifacts, now, timeZone).map((group) => (
                    <section
                        aria-label={group.label}
                        className="flex flex-col gap-1"
                        key={group.key}
                    >
                        <h2 className="artifact-group-label">{group.label}</h2>
                        <Collection
                            label={group.label}
                            onOpen={open}
                            rows={group.artifacts.map(rowFor)}
                            serverId={serverId}
                        />
                    </section>
                ))
            )}
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

function LibraryEmptyState({ filtered }: { filtered: boolean }) {
    return (
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon icon={FolderLibraryIcon} />
                </EmptyState.Media>
                <EmptyState.Title>
                    {filtered ? 'No matching files' : 'No artifacts yet'}
                </EmptyState.Title>
                <EmptyState.Description>
                    {filtered
                        ? 'Try another folder, file type, or search.'
                        : 'Files Agents and members publish to this Server appear here.'}
                </EmptyState.Description>
            </EmptyState.Header>
        </EmptyState>
    );
}
