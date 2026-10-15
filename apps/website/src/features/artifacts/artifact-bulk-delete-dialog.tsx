import { AlertDialog, Button, toast } from '@heroui/react';
import { useArtifactDeleteMany } from '../../hooks/artifacts/use-artifact-delete-many.ts';
import type { BulkDeletePlan } from './library-bulk.ts';

/**
 * Confirms deleting a selection's files and every revision of each, in one
 * request. Only files this member may delete are sent (their own, or any for
 * a human Owner/Admin); when the selection holds others, or folders, the
 * dialog says how many it deletes and that the rest stay. The Server applies
 * the same rule and reports anything it still left.
 */
export function ArtifactBulkDeleteDialog({
    onClose,
    onDeleted,
    plan,
    serverId,
}: {
    onClose: () => void;
    /** After the delete lands, before the dialog closes (the library clears its selection). */
    onDeleted: () => void;
    plan: BulkDeletePlan | null;
    serverId: string;
}) {
    const remove = useArtifactDeleteMany(serverId);
    const close = () => {
        remove.reset();
        onClose();
    };
    const count = plan?.deletable.length ?? 0;
    const files = count === 1 ? '1 file' : `${count} files`;
    const partial = plan !== null && plan.kept > 0;
    return (
        <AlertDialog.Backdrop
            isDismissable={!remove.isPending}
            isOpen={plan !== null}
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
                        <AlertDialog.Heading>Delete {files}?</AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body>
                        {partial && plan ? (
                            <p>
                                {count} of {plan.total} selected items can be deleted. The other{' '}
                                {plan.kept} stay: folders, and files only their creator or an Owner
                                or Admin can delete.
                            </p>
                        ) : null}
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
                                if (!plan) {
                                    return;
                                }
                                try {
                                    const result = await remove.removeMany(
                                        plan.deletable.map((file) => file.artifact_id)
                                    );
                                    if (result.forbidden.length > 0) {
                                        toast.warning(
                                            `${result.forbidden.length} could not be deleted`,
                                            {
                                                description:
                                                    'Only their creator or an Owner or Admin can delete them.',
                                            }
                                        );
                                    }
                                    onDeleted();
                                    close();
                                } catch {
                                    // The message renders above.
                                }
                            }}
                            variant="danger"
                        >
                            Delete {files}
                        </Button>
                    </AlertDialog.Footer>
                </AlertDialog.Dialog>
            </AlertDialog.Container>
        </AlertDialog.Backdrop>
    );
}
