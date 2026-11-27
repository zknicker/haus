import { type Task, taskTitleSchema } from '@haus/api';
import { Button, FieldError, Form, Input, Label, Modal, TextField } from '@heroui/react';
import * as React from 'react';
import { useUpdateTask } from '../../hooks/tasks/use-update-task.ts';

const formId = 'rename-task-form';

export function RenameTaskDialog({
    onClose,
    task,
}: {
    onClose: () => void;
    task: Pick<Task, 'id' | 'serverId' | 'title' | 'version'>;
}) {
    const update = useUpdateTask();
    const [title, setTitle] = React.useState(task.title);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async () => {
        const parsed = taskTitleSchema.safeParse(title);
        if (!parsed.success) {
            setError('Give this task a title.');
            return;
        }
        if (parsed.data === task.title) {
            onClose();
            return;
        }
        try {
            await update.mutateAsync({
                expectedVersion: task.version,
                patch: { title: parsed.data },
                serverId: task.serverId,
                taskId: task.id,
            });
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The rename failed.');
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
                        <Modal.Heading>Rename task</Modal.Heading>
                    </Modal.Header>
                    <Modal.Body>
                        <Form
                            id={formId}
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (!update.isPending) {
                                    void submit();
                                }
                            }}
                        >
                            <TextField
                                autoFocus
                                fullWidth
                                isInvalid={error !== null}
                                onChange={(value) => {
                                    setTitle(value);
                                    setError(null);
                                }}
                                value={title}
                                variant="secondary"
                            >
                                <Label>Title</Label>
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
                            form={formId}
                            isDisabled={title.trim().length === 0}
                            isPending={update.isPending}
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
