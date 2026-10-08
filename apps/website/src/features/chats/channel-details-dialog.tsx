import { type Chat, channelDescriptionMaxLength } from '@haus/api';
import {
    Button,
    FieldError,
    Form,
    Input,
    Label,
    Modal,
    TextArea,
    TextField,
    toast,
} from '@heroui/react';
import * as React from 'react';
import { useChannelUpdate } from '../../hooks/servers/use-channel-update.ts';
import { ChannelDialogError } from './channel-dialog-error.tsx';
import { channelHandleIssue } from './channel-handle.ts';

/** Edit a channel's name (its handle) and the description Agents read to learn its purpose. */
export function ChannelDetailsDialog({ chat, onClose }: { chat: Chat; onClose: () => void }) {
    const updateChannel = useChannelUpdate();
    const currentName = chat.name ?? '';
    const currentDescription = chat.description ?? '';
    const [name, setName] = React.useState(currentName);
    const [description, setDescription] = React.useState(currentDescription);
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const handleIssue = channelHandleIssue(name);
    const changed = trimmedName !== currentName || trimmedDescription !== currentDescription;
    const canSubmit =
        trimmedName.length > 0 &&
        !handleIssue &&
        trimmedDescription.length <= channelDescriptionMaxLength &&
        changed &&
        !updateChannel.isPending;

    const handleSubmit = React.useEffectEvent(async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!canSubmit) {
            return;
        }

        try {
            await updateChannel.mutateAsync({
                agentIds: chat.participantAgentIds,
                chatId: chat.id,
                description: trimmedDescription,
                name: trimmedName,
                serverId: chat.serverId,
            });
            toast.success('Channel updated');
            onClose();
        } catch {
            // The dialog stays open and shows the failure inline.
        }
    });

    return (
        <Modal.Backdrop isDismissable isOpen onOpenChange={(open) => !open && onClose()}>
            <Modal.Container size="sm">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>Edit channel</Modal.Heading>
                        <p className="text-muted text-sm leading-5">
                            Agents address the channel by its name and read the description to learn
                            what belongs here.
                        </p>
                    </Modal.Header>
                    <Modal.Body>
                        <Form
                            className="flex flex-col gap-4"
                            id="channel-details-form"
                            onSubmit={handleSubmit}
                        >
                            <TextField
                                fullWidth
                                isDisabled={updateChannel.isPending || chat.isAll}
                                isInvalid={Boolean(handleIssue)}
                                onChange={setName}
                                value={name}
                                variant="secondary"
                            >
                                <Label>Channel name</Label>
                                <Input autoFocus={!chat.isAll} placeholder="planning" type="text" />
                                {handleIssue ? <FieldError>{handleIssue}</FieldError> : null}
                            </TextField>
                            <TextField
                                fullWidth
                                isDisabled={updateChannel.isPending}
                                onChange={setDescription}
                                value={description}
                                variant="secondary"
                            >
                                <Label>Description</Label>
                                <TextArea
                                    autoFocus={chat.isAll}
                                    maxLength={channelDescriptionMaxLength}
                                    placeholder="What this channel is for"
                                    rows={3}
                                />
                            </TextField>
                            <ChannelDialogError message={updateChannel.error?.message ?? null} />
                        </Form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button slot="close" type="button" variant="secondary">
                            Cancel
                        </Button>
                        <Button
                            form="channel-details-form"
                            isDisabled={!canSubmit}
                            isPending={updateChannel.isPending}
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
