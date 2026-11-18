import { Button, Modal } from '@heroui/react';
import { getDesktopBridge, isElectronDesktopApp } from '../../../lib/desktop-bridge.ts';

export function SkoolConnectDialog({
    onClose,
    onConnect,
    affectedAgentCount = 0,
}: {
    onClose: () => void;
    onConnect: () => void;
    affectedAgentCount?: number;
}) {
    const desktop = isElectronDesktopApp();
    const supported = desktop && Boolean(getDesktopBridge()?.skoolLogin);
    return (
        <Modal.Backdrop isOpen onOpenChange={(open) => !open && onClose()}>
            <Modal.Container size="sm">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>
                            {desktop ? 'Connect Skool' : 'Desktop app required'}
                        </Modal.Heading>
                    </Modal.Header>
                    <Modal.Body>
                        <p>
                            {supported
                                ? 'Sign in to Skool in a new Haus browser tab. Haus will securely connect your account and its communities. You can use the connection on web and mobile afterward.'
                                : desktop
                                  ? 'Update the Haus desktop app to connect Skool.'
                                  : 'Skool sign-in is not available on the web. Open Connections in the Haus desktop app to complete setup. You can use the connection here afterward.'}
                        </p>
                        {affectedAgentCount > 0 ? (
                            <p>
                                Signing in again replaces the Skool account used by{' '}
                                {affectedAgentCount} Agents.
                            </p>
                        ) : null}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button onPress={onClose} variant="secondary">
                            {supported ? 'Cancel' : 'Got it'}
                        </Button>
                        {supported ? <Button onPress={onConnect}>Sign in to Skool</Button> : null}
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}
