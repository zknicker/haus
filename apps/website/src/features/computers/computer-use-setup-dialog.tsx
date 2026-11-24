import { Badge, Button, Modal, toast } from '@heroui/react';
import { Copy01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { writeClipboardText } from '../../lib/clipboard.ts';
import type { ComputerUsePermission } from './computer-use-model.ts';

export function ComputerUseSetupDialog({
    appPath,
    deviceName,
    isChecking,
    onClose,
    permission,
}: {
    appPath: string;
    deviceName: string;
    isChecking: boolean;
    onClose: () => void;
    permission: ComputerUsePermission;
}) {
    const granted = permission.state === 'granted';
    return (
        <Modal.Backdrop
            isDismissable
            isOpen
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                }
            }}
        >
            <Modal.Container size="sm">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>{permission.pane}</Modal.Heading>
                        <p>{permission.purpose}</p>
                    </Modal.Header>
                    <Modal.Body>
                        <div className="grid gap-3">
                            <ol className="grid list-decimal gap-2 ps-5">
                                <li>{permission.steps}</li>
                                <li>
                                    In the file picker, press ⌘⇧G and paste the path to Haus
                                    Computer:
                                    <code className="block break-all">{appPath}</code>
                                </li>
                            </ol>
                            <p className="text-muted">
                                Do this on {deviceName} itself, through Screen Sharing if it has no
                                display.
                            </p>
                            <p aria-live="polite" className="inline-flex items-center gap-1.5">
                                <Badge
                                    className="static transform-none"
                                    color={granted ? 'success' : 'warning'}
                                    size="sm"
                                />
                                {granted
                                    ? 'Granted'
                                    : isChecking
                                      ? 'Checking…'
                                      : 'Waiting for macOS'}
                            </p>
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button onPress={() => void copyPath(appPath)} variant="secondary">
                            <Icon icon={Copy01Icon} size={16} />
                            Copy path
                        </Button>
                        <Button slot="close" variant={granted ? 'primary' : 'secondary'}>
                            Done
                        </Button>
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

async function copyPath(path: string) {
    try {
        await writeClipboardText(path);
        toast.success('Path copied');
    } catch {
        toast.danger('Could not copy the path');
    }
}
