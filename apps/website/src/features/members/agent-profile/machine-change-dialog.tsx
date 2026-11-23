import { AlertDialog, Button } from '@heroui/react';
import { type MachineOption, machineChangeText } from '../../computers/machine-model.ts';
import { SettingsRowError } from '../../settings/layout/settings-text.tsx';

export function MachineChangeDialog({
    agentName,
    error,
    from,
    onConfirm,
    onOpenChange,
    pending,
    to,
}: {
    agentName: string;
    error: string | undefined;
    from: MachineOption;
    onConfirm: (input: { fromLastSynced: boolean }) => void;
    onOpenChange: (open: boolean) => void;
    pending: boolean;
    to: MachineOption;
}) {
    return (
        <AlertDialog isOpen onOpenChange={onOpenChange}>
            <AlertDialog.Backdrop isDismissable>
                <AlertDialog.Container size="sm">
                    <AlertDialog.Dialog>
                        <AlertDialog.Header>
                            <AlertDialog.Heading>Change machine</AlertDialog.Heading>
                        </AlertDialog.Header>
                        <AlertDialog.Body>
                            <p>{machineChangeText({ agent: agentName, from, to: to.label })}</p>
                            <SettingsRowError>{error}</SettingsRowError>
                        </AlertDialog.Body>
                        <AlertDialog.Footer>
                            {from.online ? (
                                <>
                                    <Button slot="close" type="button" variant="secondary">
                                        Cancel
                                    </Button>
                                    <Button
                                        isPending={pending}
                                        onPress={() => onConfirm({ fromLastSynced: false })}
                                        type="button"
                                    >
                                        Change machine
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button
                                        isDisabled={pending}
                                        onPress={() => onConfirm({ fromLastSynced: false })}
                                        type="button"
                                        variant="secondary"
                                    >
                                        Wait for {from.label}
                                    </Button>
                                    <Button
                                        isPending={pending}
                                        onPress={() => onConfirm({ fromLastSynced: true })}
                                        type="button"
                                    >
                                        Move now
                                    </Button>
                                </>
                            )}
                        </AlertDialog.Footer>
                    </AlertDialog.Dialog>
                </AlertDialog.Container>
            </AlertDialog.Backdrop>
        </AlertDialog>
    );
}
