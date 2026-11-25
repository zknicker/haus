import { ItemCardGroup } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import { Fragment } from 'react';
import { useArtifactRestore } from '../../hooks/artifacts/use-artifact-restore.ts';
import { useArtifactVersions } from '../../hooks/artifacts/use-artifact-versions.ts';
import type { RevisionView } from './artifact-compare-url.ts';
import { ArtifactHistoryRow } from './artifact-history-row.tsx';
import { revisionCompareBase } from './artifact-revision-base.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

export function ArtifactHistory({
    artifactId,
    canCompare,
    serverId,
    slug,
    viewHref,
    viewingRevisionId,
}: {
    artifactId: string;
    canCompare: boolean;
    serverId: string;
    slug: string;
    viewHref: (view: RevisionView) => string;
    viewingRevisionId: string;
}) {
    const directory = useArtifactCreatorDirectory(serverId);
    const revisions = useArtifactVersions(serverId, artifactId);
    const restore = useArtifactRestore(serverId, artifactId);
    const versions = revisions.versions ?? [];
    const currentId = versions[0]?.revision_id;
    const pinned = (revisionId: string) => (revisionId === currentId ? null : revisionId);
    const compareHref = (revisionId: string) => {
        const base = canCompare ? revisionCompareBase(versions, revisionId) : null;
        return base ? viewHref({ compare: base, revision: pinned(revisionId) }) : null;
    };
    return (
        <ItemCardGroup aria-label="History" id="revisions" variant="transparent">
            {revisions.error ? <p role="alert">{revisions.error.message}</p> : null}
            {versions.map((version) => (
                <Fragment key={version.revision_id}>
                    <ArtifactHistoryRow
                        compareHref={compareHref(version.revision_id)}
                        directory={directory}
                        onRestore={
                            version.revision_id === currentId
                                ? null
                                : () => restore.restore(version.revision_id)
                        }
                        restore={{
                            isPending: restore.isPending,
                            isRestoring: restore.pendingRevisionId === version.revision_id,
                        }}
                        serverId={serverId}
                        slug={slug}
                        version={version}
                        viewHref={
                            version.revision_id === viewingRevisionId
                                ? null
                                : viewHref({ compare: null, revision: version.revision_id })
                        }
                    />
                </Fragment>
            ))}
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
