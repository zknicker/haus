import { AlertDialog, Button } from '@heroui/react';

/** Offered once at the end of a pressed run when the downloaded App waits to restart. */
export function HausUpdateRestartDialog({
    isOpen,
    onLater,
    onRestart,
}: {
    isOpen: boolean;
    onLater: () => void;
    onRestart: () => void;
}) {
    return (
        <AlertDialog.Backdrop
            isOpen={isOpen}
            onOpenChange={(open) => {
                if (!open) {
                    onLater();
                }
            }}
        >
            <AlertDialog.Container size="sm">
                <AlertDialog.Dialog>
                    <AlertDialog.Header>
                        <AlertDialog.Icon status="accent" />
                        <AlertDialog.Heading>Update ready</AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body>
                        <p>Restart Haus to finish updating.</p>
                    </AlertDialog.Body>
                    <AlertDialog.Footer>
                        <Button slot="close" variant="tertiary">
                            Later
                        </Button>
                        <Button onPress={onRestart}>Restart now</Button>
                    </AlertDialog.Footer>
                </AlertDialog.Dialog>
            </AlertDialog.Container>
        </AlertDialog.Backdrop>
    );
}
