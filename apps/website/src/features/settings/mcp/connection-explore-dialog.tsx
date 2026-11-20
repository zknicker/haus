import { Button, Modal } from '@heroui/react';
import { ConnectionCatalog } from './connection-catalog.tsx';

export function ConnectionExploreDialog({
    onAddCustom,
    onOpenChange,
    open,
    serverId,
}: {
    onAddCustom: () => void;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    serverId: string;
}) {
    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container scroll="inside" size="lg">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>Explore connections</Modal.Heading>
                    </Modal.Header>
                    <Modal.Body>
                        <ConnectionCatalog serverId={serverId} />
                    </Modal.Body>
                    <Modal.Footer>
                        <Button onPress={onAddCustom} variant="secondary">
                            Add custom connection
                        </Button>
                        <Button slot="close">Done</Button>
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}
