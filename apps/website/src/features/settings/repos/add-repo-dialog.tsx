import type { ComputerAddRepoFolderResult } from '@haus/api';
import { Modal } from '@heroui/react';
import { useState } from 'react';
import { AddRepoForm } from './add-repo-form.tsx';
import { AddRepoResult } from './add-repo-result.tsx';

export function AddRepoDialog({
    computerId,
    onClose,
    serverId,
    serverSlug,
}: {
    computerId?: string;
    onClose: () => void;
    serverId: string;
    serverSlug: string;
}) {
    const [added, setAdded] = useState<
        (ComputerAddRepoFolderResult & { computerId: string }) | null
    >(null);

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
            <Modal.Container size="md">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    {added ? (
                        <AddRepoResult
                            added={added}
                            onAddAnother={() => setAdded(null)}
                            onClose={onClose}
                            serverId={serverId}
                            serverSlug={serverSlug}
                        />
                    ) : (
                        <AddRepoForm
                            computerId={computerId}
                            onAdded={setAdded}
                            onClose={onClose}
                            serverId={serverId}
                        />
                    )}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}
