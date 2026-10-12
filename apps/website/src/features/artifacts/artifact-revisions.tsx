import { Button, Chip, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArtifactVersions } from '../../hooks/artifacts/use-artifact-versions.ts';
import { artifactPath, formatArtifactDate } from './artifact-format.ts';

/** Every revision, newest first; the one on screen is marked, any other opens pinned. */
export function ArtifactRevisions({
    artifactId,
    serverId,
    slug,
    viewingRevisionId,
}: {
    artifactId: string;
    serverId: string;
    slug: string;
    viewingRevisionId: string;
}) {
    const navigate = useNavigate();
    const revisions = useArtifactVersions(serverId, artifactId);
    const versions = revisions.versions;
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Revisions</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            {revisions.error ? <p role="alert">{revisions.error.message}</p> : null}
            {versions?.map((version, index) => {
                const viewing = version.revision_id === viewingRevisionId;
                return (
                    <Fragment key={version.revision_id}>
                        {index > 0 ? <Separator /> : null}
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>Revision {version.revision_number}</ItemCard.Title>
                                <ItemCard.Description>
                                    {formatArtifactDate(version.updated_at)}
                                </ItemCard.Description>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                {viewing ? (
                                    <Chip size="sm" variant="soft">
                                        Viewing
                                    </Chip>
                                ) : (
                                    <Button
                                        aria-label={`View revision ${version.revision_number}`}
                                        onPress={() =>
                                            navigate(
                                                artifactPath(slug, artifactId, version.revision_id)
                                            )
                                        }
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
