import { Button, Modal } from '@heroui/react';
import { ComputerIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
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
                        <Modal.Icon className="bg-default text-foreground">
                            <Icon className="size-5" icon={ComputerIcon} />
                        </Modal.Icon>
                        <Modal.Heading>Add device</Modal.Heading>
                        <p className="text-muted mt-1.5 text-sm leading-5">
                            Run Captains on an Apple Silicon Mac you control.
                        </p>
                    </Modal.Header>
                    <Modal.Body>
                        <div className="flex flex-col gap-4 pt-2">
                            <ComputerSetupCommands serverSlug={serverSlug} />
                            {open ? (
                                <AddDeviceProgress serverId={serverId} serverSlug={serverSlug} />
                            ) : null}
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
