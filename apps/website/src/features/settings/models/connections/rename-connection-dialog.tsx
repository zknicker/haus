import { type ModelConnection, modelConnectionLabelSchema } from '@haus/api';
import { Button, FieldError, Form, Input, Label, Modal, TextField } from '@heroui/react';
import { useState } from 'react';
import { useModelConnectionEdits } from '../../../../hooks/servers/use-model-connections.ts';
import { connectionErrorMessage } from './model-connection-model.ts';

const FORM_ID = 'rename-model-connection-form';

export function RenameConnectionDialog({
    connection,
    onClose,
    serverId,
}: {
    connection: Pick<ModelConnection, 'id' | 'label'>;
    onClose: () => void;
    serverId: string;
}) {
    const { rename } = useModelConnectionEdits(serverId);
    const [label, setLabel] = useState(connection.label);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        const parsed = modelConnectionLabelSchema.safeParse(label);
        if (!parsed.success) {
            setError('Name this connection.');
            return;
        }
        try {
            await rename.mutateAsync({ connectionId: connection.id, label: parsed.data, serverId });
            onClose();
        } catch (cause) {
            setError(connectionErrorMessage(cause));
        }
    };

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
                        <Modal.Heading>Rename connection</Modal.Heading>
                    </Modal.Header>
                    <Modal.Body>
                        <Form
                            id={FORM_ID}
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (!rename.isPending) {
                                    void submit();
                                }
                            }}
                        >
                            <TextField
                                autoFocus
                                fullWidth
                                isInvalid={error !== null}
                                onChange={(value) => {
                                    setLabel(value);
                                    setError(null);
                                }}
                                value={label}
                                variant="secondary"
                            >
                                <Label>Name</Label>
                                <Input autoComplete="off" />
                                <FieldError>{error}</FieldError>
                            </TextField>
                        </Form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button onPress={onClose} slot="close" type="button" variant="secondary">
                            Cancel
                        </Button>
                        <Button
                            form={FORM_ID}
                            isDisabled={label.trim().length === 0}
                            isPending={rename.isPending}
                            type="submit"
                        >
                            Save
                        </Button>
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}
