import { Button, Modal } from '@heroui/react';
import { AddDeviceProgress } from './add-device-progress.tsx';
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
                    <Modal.Body>
                        <div className="flex flex-col gap-4 pt-2">
                            <ComputerSetupCommands serverSlug={serverSlug} />
                            {open ? <AddDeviceProgress key={serverId} serverId={serverId} /> : null}
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button slot="close" variant="secondary">
                            Done
                        </Button>
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}
