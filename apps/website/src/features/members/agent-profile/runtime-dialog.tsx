import type { Agent, ComputerInventory, ModelConnection } from '@haus/api';
import { Modal } from '@heroui/react';
import { RunnerModelForm } from './runner-model-form.tsx';
import type { RuntimeConfigDraft } from './runtime-model.ts';

type Runtime = ComputerInventory['runtimes'][number];

export function RuntimeDialog({
    agent,
    connections,
    error,
    onOpenChange,
    onSave,
    open,
    pending,
    runtimes,
}: {
    agent: Agent;
    connections: ModelConnection[];
    error: string | null;
    onOpenChange: (open: boolean) => void;
    onSave: (draft: RuntimeConfigDraft) => Promise<void>;
    open: boolean;
    pending: boolean;
    runtimes: Runtime[];
}) {
    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container size="md">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <RunnerModelForm
                        agent={agent}
                        connections={connections}
                        error={error}
                        onSave={onSave}
                        pending={pending}
                        runtimes={runtimes}
                    />
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}
