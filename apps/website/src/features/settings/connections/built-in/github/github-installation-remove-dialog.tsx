import type { GithubInstallation } from '@haus/api';
import { AlertDialog, Button } from '@heroui/react';
import { useRef } from 'react';
import { useGithubUnbindInstallation } from '../../../../../hooks/github/use-github-unbind-installation.ts';
import { useInstallationTriggers } from '../../../../../hooks/github/use-installation-triggers.ts';
import { githubRemovalBody, triggersOnInstallation } from './github-installation-model.ts';

/**
 * Removing an installation from Haus stops every Trigger on it, so the
 * confirmation names them. Confirm waits for that list rather than asking
 * blind.
 */
export function GithubInstallationRemoveDialog({
    connectionId,
    installation,
    onClose,
    serverId,
}: {
    connectionId: string;
    installation: GithubInstallation | null;
    onClose: () => void;
    serverId: string;
}) {
    const triggers = useInstallationTriggers(serverId, installation !== null);
    const unbind = useGithubUnbindInstallation(serverId, connectionId);
    // The dialog animates itself out, so the last installation is held until
    // the next open replaces it rather than emptying the heading mid-fade.
    const held = useRef(installation);
    if (installation) {
        held.current = installation;
    }
    const shown = installation ?? held.current;
    const login = shown?.account.login ?? '';
    const dependents =
        shown && triggers.data ? triggersOnInstallation(triggers.data, shown.id) : [];

    return (
        <AlertDialog
            isOpen={installation !== null}
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                }
            }}
        >
            <AlertDialog.Backdrop isDismissable>
                <AlertDialog.Container size="sm">
                    <AlertDialog.Dialog>
                        <AlertDialog.Header>
                            <AlertDialog.Icon status="danger" />
                            <AlertDialog.Heading>Remove {login} from Haus?</AlertDialog.Heading>
                        </AlertDialog.Header>
                        <AlertDialog.Body>
                            {triggers.data ? githubRemovalBody(login, dependents) : null}
                        </AlertDialog.Body>
                        <AlertDialog.Footer>
                            <Button isDisabled={unbind.isPending} slot="close" variant="secondary">
                                Cancel
                            </Button>
                            <Button
                                isDisabled={!triggers.data}
                                isPending={unbind.isPending}
                                onPress={() => {
                                    if (!installation) {
                                        return;
                                    }
                                    void unbind
                                        .unbind(installation.id)
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
