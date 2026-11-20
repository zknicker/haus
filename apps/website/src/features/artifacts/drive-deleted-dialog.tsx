import { type ArtifactDeletedRecord, driveDeletedRetentionDays } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Modal, Separator } from '@heroui/react';
import { Fragment } from 'react';
import { useArtifactDeleted } from '../../hooks/artifacts/use-artifact-deleted.ts';
import { useDeletedArtifactRestore } from '../../hooks/artifacts/use-deleted-artifact-restore.ts';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { deletedRowFacts } from './drive-deleted-row.ts';
import { driveAgentName, driveFolderLabel } from './drive-places.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

export function DriveDeletedDialog({
    folder,
    onClose,
    serverId,
}: {
    folder: string | null;
    onClose: () => void;
    serverId: string;
}) {
    return (
        <Modal.Backdrop
            isDismissable
            isOpen={folder !== null}
            onOpenChange={(open) => !open && onClose()}
        >
            <Modal.Container scroll="inside" size="md">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    {folder === null ? null : <DeletedList folder={folder} serverId={serverId} />}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function DeletedList({ folder, serverId }: { folder: string; serverId: string }) {
    const agents = useAgentAppearances(serverId);
    const listing = useArtifactDeleted(serverId, folder);
    const deleted = listing.deleted;
    return (
        <>
            <Modal.Header>
                <Modal.Heading>
                    Recently deleted in {driveFolderLabel(folder, driveAgentName(agents))}
                </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex min-h-32 flex-col gap-3">
                <p className="text-muted text-sm">
                    Deleted files can be restored for {driveDeletedRetentionDays} days.
                </p>
                {listing.error ? (
                    <p className="text-danger text-sm" role="alert">
                        {listing.error.message}
                    </p>
                ) : null}
                {deleted && deleted.length === 0 ? (
                    <p className="text-muted text-sm">Nothing deleted here lately.</p>
                ) : null}
                {deleted && deleted.length > 0 ? (
                    <DeletedRows deleted={deleted} folder={folder} serverId={serverId} />
                ) : null}
                {listing.hasMore ? (
                    <Button
                        className="self-center"
                        isPending={listing.isFetchingMore}
                        onPress={listing.loadMore}
                        size="sm"
                        variant="ghost"
                    >
                        Show more
                    </Button>
                ) : null}
            </Modal.Body>
        </>
    );
}

function DeletedRows({
    deleted,
    folder,
    serverId,
}: {
    deleted: readonly ArtifactDeletedRecord[];
    folder: string;
    serverId: string;
}) {
    const directory = useArtifactCreatorDirectory(serverId);
    const restore = useDeletedArtifactRestore(serverId, folder);
    const now = Date.now();
    return (
        <ItemCardGroup aria-label="Deleted files" className="overflow-hidden">
            {deleted.map((record, index) => {
                const { artifact } = record;
                return (
                    <Fragment key={artifact.artifact_id}>
                        {index > 0 ? <Separator /> : null}
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>{artifact.filename}</ItemCard.Title>
                                <ItemCard.Description>
                                    {deletedRowFacts(record, folder, directory, now)}
                                </ItemCard.Description>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <Button
                                    aria-label={`Restore ${artifact.filename}`}
                                    isDisabled={restore.pendingArtifactId !== undefined}
                                    isPending={restore.pendingArtifactId === artifact.artifact_id}
                                    onPress={() => restore.restore(artifact)}
                                    size="sm"
                                    variant="ghost"
                                >
                                    Restore
                                </Button>
                            </ItemCard.Action>
                        </ItemCard>
                    </Fragment>
                );
            })}
        </ItemCardGroup>
    );
}
