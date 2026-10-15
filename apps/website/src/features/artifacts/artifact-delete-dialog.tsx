import { AlertDialog, Button } from '@heroui/react';
import { useArtifactDelete } from '../../hooks/artifacts/use-artifact-delete.ts';

/** The file a delete is confirming. */
export interface ArtifactDeleteTarget {
    artifactId: string;
    filename: string;
}

/**
 * Confirms deleting a file and its every revision. Offered only to the file's
 * creator and human Owners/Admins, the Server's own rule, which it still
 * enforces; a refusal shows here.
 */
export function ArtifactDeleteDialog({
    onClose,
    onDeleted,
    serverId,
    target,
}: {
    onClose: () => void;
    /** After the delete lands, before the dialog closes (the viewer leaves the deleted file). */
    onDeleted?: () => void;
    serverId: string;
    target: ArtifactDeleteTarget | null;
}) {
    const remove = useArtifactDelete(serverId);
    const close = () => {
        remove.reset();
        onClose();
    };
    return (
        <AlertDialog.Backdrop
            isDismissable={!remove.isPending}
            isOpen={target !== null}
            onOpenChange={(open) => {
                if (!open) {
                    close();
                }
            }}
        >
            <AlertDialog.Container size="sm">
                <AlertDialog.Dialog>
                    <AlertDialog.Header>
                        <AlertDialog.Icon status="danger" />
                        <AlertDialog.Heading>Delete “{target?.filename}”?</AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body>
                        <p>Every revision and its links stop working for everyone right away.</p>
                        {remove.error ? (
                            <p className="text-danger" role="alert">
                                {remove.error}
                            </p>
                        ) : null}
                    </AlertDialog.Body>
                    <AlertDialog.Footer>
                        <Button isDisabled={remove.isPending} slot="close" variant="secondary">
                            Cancel
                        </Button>
                        <Button
                            isPending={remove.isPending}
                            onPress={async () => {
                                if (!target) {
                                    return;
                                }
                                try {
                                    await remove.remove(target.artifactId);
                                    onDeleted?.();
                                    close();
                                } catch {
                                    // The message renders above.
                                }
                            }}
                            variant="danger"
                        >
                            Delete
                        </Button>
                    </AlertDialog.Footer>
                </AlertDialog.Dialog>
            </AlertDialog.Container>
        </AlertDialog.Backdrop>
    );
}
