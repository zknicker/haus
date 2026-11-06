import {
    Alert,
    Button,
    Form,
    Input,
    Label,
    ListBox,
    Modal,
    Select,
    TextField,
    toast,
} from '@heroui/react';
import * as React from 'react';
import { useBoards } from '../../hooks/boards/use-boards.ts';
import { useCreateTask } from '../../hooks/tasks/use-create-task.ts';
import { useOpenTaskReference } from '../../hooks/tasks/use-open-task-reference.ts';
import { messagePreviewLine } from '../chats/message-preview-line.ts';

const taskTitleMaxLength = 200;

/**
 * Convert to Task (ADR 0051): a new Task on the chosen board, its title the
 * message's first line. The Server defaults its description to the message and
 * records the message in Mentioned in. Rendered only while open, so a transcript
 * row pays nothing for it until someone asks.
 */
export function ConvertToTaskDialog({
    content,
    messageId,
    onClose,
    serverId,
}: {
    content: string;
    messageId: string;
    onClose: () => void;
    serverId: string;
}) {
    const boards = useBoards(serverId).data ?? [];
    const create = useCreateTask();
    const openTask = useOpenTaskReference(serverId);
    const [pickedBoardId, setPickedBoardId] = React.useState<null | string>(null);
    const [title, setTitle] = React.useState(() => firstLineTitle(content));
    const board = boards.find((candidate) => candidate.id === pickedBoardId) ?? boards[0] ?? null;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!(board && title.trim())) {
            return;
        }
        const { task } = await create.mutateAsync({
            boardId: board.id,
            serverId,
            sourceMessageId: messageId,
            title: title.trim(),
        });
        onClose();
        toast.success(`${task.key} created`, {
            actionProps: {
                children: 'Open task',
                onPress: () => {
                    openTask({ key: task.key, taskId: task.id }).catch(() =>
                        toast.danger(`Could not open ${task.key}`)
                    );
                },
            },
        });
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
            <Modal.Container>
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>Convert to Task</Modal.Heading>
                    </Modal.Header>
                    <Modal.Body>
                        <Form
                            className="grid gap-4"
                            id="convert-to-task-form"
                            onSubmit={(event) => {
                                submit(event).catch(() => undefined);
                            }}
                        >
                            <Select
                                fullWidth
                                onChange={(value) => value && setPickedBoardId(String(value))}
                                value={board?.id ?? null}
                                variant="secondary"
                            >
                                <Label>Board</Label>
                                <Select.Trigger>
                                    <Select.Value>{board?.name}</Select.Value>
                                    <Select.Indicator />
                                </Select.Trigger>
                                <Select.Popover>
                                    <ListBox>
                                        {boards.map((candidate) => (
                                            <ListBox.Item
                                                id={candidate.id}
                                                key={candidate.id}
                                                textValue={candidate.name}
                                            >
                                                <Label>{candidate.name}</Label>
                                                <ListBox.ItemIndicator />
                                            </ListBox.Item>
                                        ))}
                                    </ListBox>
                                </Select.Popover>
                            </Select>
                            <TextField
                                fullWidth
                                maxLength={taskTitleMaxLength}
                                onChange={setTitle}
                                value={title}
                                variant="secondary"
                            >
                                <Label>Title</Label>
                                <Input autoFocus />
                            </TextField>
                            {create.error ? (
                                <Alert role="alert" status="danger">
                                    <Alert.Indicator />
                                    <Alert.Content>
                                        <Alert.Description>
                                            {create.error.message}
                                        </Alert.Description>
                                    </Alert.Content>
                                </Alert>
                            ) : null}
                        </Form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button slot="close" type="button" variant="secondary">
                            Cancel
                        </Button>
                        <Button
                            form="convert-to-task-form"
                            isDisabled={!(board && title.trim())}
                            isPending={create.isPending}
                            type="submit"
                        >
                            Create Task
                        </Button>
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

/** The message's first line as plain text, within what a Task title may hold. */
export function firstLineTitle(content: string) {
    const line = content.split('\n').find((part) => part.trim()) ?? '';
    return messagePreviewLine(line).slice(0, taskTitleMaxLength).trim();
}
