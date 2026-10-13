import { AlertDialog, Button } from '@heroui/react';

/**
 * Disconnect only makes the Computer forget the token. 1Password's CLI cannot
 * delete a service account, so the dialog names the one to revoke by hand.
 */
export function SecretsDisconnectDialog({
    computerName,
    isOpen,
    isPending,
    onClose,
    onDisconnect,
    serviceAccountName,
}: {
    computerName: string;
    isOpen: boolean;
    isPending: boolean;
    onClose: () => void;
    onDisconnect: () => void;
    serviceAccountName: string;
}) {
    return (
        <AlertDialog.Backdrop
            isDismissable
            isOpen={isOpen}
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                }
            }}
        >
            <AlertDialog.Container size="sm">
                <AlertDialog.Dialog>
                    <AlertDialog.Header>
                        <AlertDialog.Icon status="danger" />
                        <AlertDialog.Heading>Disconnect 1Password?</AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body>
                        <p>
                            Agents on {computerName} lose access to the vault right away. Haus can’t
                            delete the service account, so delete “{serviceAccountName}” on
                            1password.com under Developer → Service Accounts.
                        </p>
                    </AlertDialog.Body>
                    <AlertDialog.Footer>
                        <Button isDisabled={isPending} slot="close" variant="secondary">
                            Cancel
                        </Button>
                        <Button isPending={isPending} onPress={onDisconnect} variant="danger">
                            Disconnect
                        </Button>
                    </AlertDialog.Footer>
                </AlertDialog.Dialog>
            </AlertDialog.Container>
        </AlertDialog.Backdrop>
    );
}
