import { ARTIFACT_REVISION_RETENTION_DAYS } from '@haus/api';
import { Button, Chip, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArtifactRestore } from '../../hooks/artifacts/use-artifact-restore.ts';
import { useArtifactVersions } from '../../hooks/artifacts/use-artifact-versions.ts';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { formatArtifactBytes, formatArtifactDate } from './artifact-format.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

/**
 * Every revision, newest first, each with who published it and its size. The
 * one on screen is marked and any other opens pinned; an older one can be
 * restored, which publishes its bytes as a new revision rather than rewriting
 * history. Replaced revisions are kept for the retention window.
 */
export function ArtifactRevisions({
    artifactId,
    revisionHref,
    serverId,
    viewingRevisionId,
}: {
    artifactId: string;
    /** A revision's pinned viewer, keeping the viewer's folder context. */
    revisionHref: (revisionId: string) => string;
    serverId: string;
    viewingRevisionId: string;
}) {
    const navigate = useNavigate();
    const directory = useArtifactCreatorDirectory(serverId);
    const revisions = useArtifactVersions(serverId, artifactId);
    const restore = useArtifactRestore(serverId, artifactId);
    const versions = revisions.versions;
    const currentId = versions?.[0]?.revision_id;
    return (
        <ItemCardGroup id="revisions" variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Revisions</ItemCardGroup.Title>
                {versions && versions.length > 1 ? (
                    <ItemCardGroup.Description>
                        Replaced revisions are removed {ARTIFACT_REVISION_RETENTION_DAYS} days after
                        a newer one takes their place.
                    </ItemCardGroup.Description>
                ) : null}
            </ItemCardGroup.Header>
            {revisions.error ? <p role="alert">{revisions.error.message}</p> : null}
            {versions?.map((version, index) => {
                const viewing = version.revision_id === viewingRevisionId;
                const number = version.revision_number;
                return (
                    <Fragment key={version.revision_id}>
                        {index > 0 ? <Separator /> : null}
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>Revision {number}</ItemCard.Title>
                                <ItemCard.Description>
                                    {directory.name(version.author)} ·{' '}
                                    {formatArtifactBytes(version.size_bytes)}
                                </ItemCard.Description>
                                <ItemCard.Description>
                                    {formatArtifactDate(version.updated_at)}
                                </ItemCard.Description>
                            </ItemCard.Content>
                            <ItemCard.Action className="flex items-center gap-1">
                                {version.revision_id === currentId ? null : (
                                    <Button
                                        aria-label={`Restore revision ${number}`}
                                        isDisabled={restore.isPending}
                                        isPending={
                                            restore.pendingRevisionId === version.revision_id
                                        }
                                        onPress={() => restore.restore(version.revision_id)}
                                        size="sm"
                                        variant="ghost"
                                    >
                                        Restore
                                    </Button>
                                )}
                                {viewing ? (
                                    <Chip size="sm" variant="soft">
                                        Viewing
                                    </Chip>
                                ) : (
                                    <Button
                                        {...opensPlace}
                                        aria-label={`View revision ${number}`}
                                        onPress={() => navigate(revisionHref(version.revision_id))}
                                        size="sm"
                                        variant="ghost"
                                    >
                                        View
                                    </Button>
                                )}
                            </ItemCard.Action>
                        </ItemCard>
                    </Fragment>
                );
            })}
            {revisions.hasMore ? (
                <Button
                    isPending={revisions.isFetchingMore}
                    onPress={revisions.loadMore}
                    size="sm"
                    variant="ghost"
                >
                    Show older revisions
                </Button>
            ) : null}
        </ItemCardGroup>
    );
}
