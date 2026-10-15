import type { Agent, LinearIdentity } from '@haus/api';
import { AlertDialog, Button } from '@heroui/react';
import { useRef } from 'react';
import { useLinearRemoveIdentity } from '../../../../../hooks/linear/use-linear-remove-identity.ts';

/**
 * Removing an identity hands the Agent's open delegated issues back to the
 * Haus app, and the app itself stays in Linear until an admin uninstalls it.
 */
export function LinearIdentityRemoveDialog({
    connectionId,
    onClose,
    removing,
    serverId,
}: {
    connectionId: string;
    onClose: () => void;
    removing: { agent: Agent; identity: LinearIdentity } | null;
    serverId: string;
}) {
    const remove = useLinearRemoveIdentity(serverId, connectionId);
    // Held through the closing animation so the heading does not empty mid-fade.
    const held = useRef(removing);
    if (removing) {
        held.current = removing;
    }
    const name = (removing ?? held.current)?.agent.displayName ?? '';

    return (
        <AlertDialog isOpen={removing !== null} onOpenChange={(open) => !open && onClose()}>
            <AlertDialog.Backdrop isDismissable>
                <AlertDialog.Container size="sm">
                    <AlertDialog.Dialog>
                        <AlertDialog.Header>
                            <AlertDialog.Icon status="danger" />
                            <AlertDialog.Heading>
                                Remove {name}'s Linear identity?
                            </AlertDialog.Heading>
                        </AlertDialog.Header>
                        <AlertDialog.Body>
                            {`${name} goes back to posting through the Haus app, and its open delegated issues return to it. The app stays in Linear until a workspace admin uninstalls it.`}
                        </AlertDialog.Body>
                        <AlertDialog.Footer>
                            <Button isDisabled={remove.isPending} slot="close" variant="secondary">
                                Cancel
                            </Button>
                            <Button
                                isPending={remove.isPending}
                                onPress={() => {
                                    if (!removing) {
                                        return;
                                    }
                                    void remove
                                        .remove(removing.identity.id)
                                        .then(onClose)
                                        .catch(() => undefined);
                                }}
                                variant="danger"
                            >
                                Remove
                            </Button>
                        </AlertDialog.Footer>
                    </AlertDialog.Dialog>
                </AlertDialog.Container>
            </AlertDialog.Backdrop>
        </AlertDialog>
    );
}
