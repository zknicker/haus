import { AlertDialog, Button } from '@heroui/react';
import * as React from 'react';
import { useBlocker } from 'react-router-dom';
import { isElectronDesktopApp } from '../../lib/desktop-bridge.ts';

export function UnsavedEditGuard({ dirty }: { dirty: boolean }) {
    return isElectronDesktopApp() ? null : <WebUnsavedEditGuard dirty={dirty} />;
}

function WebUnsavedEditGuard({ dirty }: { dirty: boolean }) {
    const blocker = useBlocker(dirty);
    React.useEffect(() => {
        if (!dirty) {
            return;
        }
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);
    const blocked = blocker.state === 'blocked';
    return (
        <AlertDialog.Backdrop
            isDismissable
            isOpen={blocked}
            onOpenChange={(open) => {
                if (!open && blocked) {
                    blocker.reset();
                }
            }}
        >
            <AlertDialog.Container size="sm">
                <AlertDialog.Dialog>
                    <AlertDialog.Header>
                        <AlertDialog.Icon status="warning" />
                        <AlertDialog.Heading>Discard your changes?</AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body>
                        <p>Your edits to this file are not saved.</p>
                    </AlertDialog.Body>
                    <AlertDialog.Footer>
                        <Button slot="close" variant="secondary">
                            Keep editing
                        </Button>
                        <Button onPress={() => blocker.proceed?.()} variant="danger">
                            Discard
                        </Button>
                    </AlertDialog.Footer>
                </AlertDialog.Dialog>
            </AlertDialog.Container>
        </AlertDialog.Backdrop>
    );
}
