import {
    Alert,
    Button,
    Form,
    Label,
    ListBox,
    Modal,
    Select,
    TextArea,
    TextField,
} from '@heroui/react';
import * as React from 'react';
import { useClaimCreate } from '../../../hooks/servers/use-claim-create.ts';

export interface ClaimChatOption {
    id: string;
    label: string;
}

export function NewClaimDialog({
    chats,
    onOpenChange,
    open,
    serverId,
}: {
    chats: ClaimChatOption[];
    onOpenChange: (open: boolean) => void;
    open: boolean;
    serverId: string;
}) {
    const create = useClaimCreate();
    const resetCreate = create.reset;
    const [body, setBody] = React.useState('');
    const [chatId, setChatId] = React.useState('');
    const wasOpen = React.useRef(false);
    const firstChatId = chats[0]?.id ?? '';

    React.useEffect(() => {
        if (open && !wasOpen.current) {
            setBody('');
            setChatId(firstChatId);
            resetCreate();
        }
        wasOpen.current = open;
    }, [firstChatId, open, resetCreate]);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        const content = body.trim();
        if (!(content && chatId)) {
            return;
        }
        await create.mutateAsync({
            chatId,
            content,
            nonce: crypto.randomUUID(),
            serverId,
        });
        onOpenChange(false);
    }

    const selectedChat = chats.find((chat) => chat.id === chatId) ?? null;

    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container>
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>New Task</Modal.Heading>
                        <p className="mt-1.5 text-muted text-sm leading-5">
                            Create a message and use its Thread as the claim work surface.
                        </p>
                    </Modal.Header>
                    <Modal.Body>
                        <Form className="grid gap-4" id="new-claim-form" onSubmit={submit}>
                            <Select
                                fullWidth
                                onChange={(value) => value && setChatId(String(value))}
                                value={chatId}
                                variant="secondary"
                            >
                                <Label>Chat</Label>
                                <Select.Trigger>
                                    <Select.Value>
                                        {selectedChat?.label ?? 'Choose a chat'}
                                    </Select.Value>
                                    <Select.Indicator />
                                </Select.Trigger>
                                <Select.Popover>
                                    <ListBox>
                                        {chats.map((chat) => (
                                            <ListBox.Item
                                                id={chat.id}
                                                key={chat.id}
                                                textValue={chat.label}
                                            >
                                                <Label>{chat.label}</Label>
                                                <ListBox.ItemIndicator />
                                            </ListBox.Item>
                                        ))}
                                    </ListBox>
                                </Select.Popover>
                            </Select>
                            <TextField
                                fullWidth
                                onChange={setBody}
                                value={body}
                                variant="secondary"
                            >
                                <Label>Task</Label>
                                <TextArea autoFocus placeholder="What needs to be done?" rows={4} />
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
                            form="new-claim-form"
                            isDisabled={!(body.trim() && chatId)}
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
