import { Button, Modal } from '@heroui/react';
import { AddDeviceStatusLine, useAddDeviceStatus } from './add-device-progress.tsx';
import { ComputerSetupCommands } from './computer-setup-commands.tsx';

export function AddComputerDialog({
    onOpenChange,
    open,
    serverId,
    serverSlug,
}: {
    onOpenChange: (open: boolean) => void;
    open: boolean;
    serverId: string;
    serverSlug: string;
}) {
    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container scroll="inside" size="lg">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>Add device</Modal.Heading>
                        <p className="text-muted mt-1.5 text-sm leading-5">
                            Run Captains on your own Mac.
                        </p>
                    </Modal.Header>
                    <AddDeviceSteps key={serverId} serverId={serverId} serverSlug={serverSlug} />
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function AddDeviceSteps({ serverId, serverSlug }: { serverId: string; serverSlug: string }) {
    const status = useAddDeviceStatus(serverId);
    return (
        <>
            <Modal.Body>
                <ComputerSetupCommands
                    serverSlug={serverSlug}
                    updateCommand={status?.command ?? null}
                />
            </Modal.Body>
            <Modal.Footer>
                <AddDeviceStatusLine serverId={serverId} status={status} />
                <Button slot="close" variant={status?.tone === 'success' ? 'primary' : 'secondary'}>
                    Done
                </Button>
            </Modal.Footer>
        </>
    );
}
