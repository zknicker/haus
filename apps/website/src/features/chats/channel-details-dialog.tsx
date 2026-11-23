import { type Chat, channelDescriptionMaxLength } from '@haus/api';
import { Button, Form, Input, Label, Modal, TextArea, TextField, toast } from '@heroui/react';
import * as React from 'react';
import { useChannelUpdate } from '../../hooks/servers/use-channel-update.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';

/**
 * `#all`'s name and description. `#all` is no Project, so it has no Settings
 * page; its name is fixed, which leaves the description to edit.
 */
export function ChannelDetailsDialog({ chat, onClose }: { chat: Chat; onClose: () => void }) {
    const updateChannel = useChannelUpdate(chat);
    const currentDescription = chat.description ?? '';
    const [description, setDescription] = React.useState(currentDescription);
    const trimmedDescription = description.trim();
    const canSubmit =
        trimmedDescription.length <= channelDescriptionMaxLength &&
        trimmedDescription !== currentDescription &&
        !updateChannel.isPending;

    const handleSubmit = React.useEffectEvent(async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!canSubmit) {
            return;
        }

        try {
            await updateChannel.mutateAsync({
                chatId: chat.id,
                description: trimmedDescription,
                serverId: chat.serverId,
            });
            toast.success(`#${chat.name} updated`);
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
                        <p>Captains read the description to learn what belongs here.</p>
                    </Modal.Header>
                    <Modal.Body>
                        <Form
                            className="flex flex-col gap-4"
                            id="channel-details-form"
                            onSubmit={handleSubmit}
                        >
                            <TextField
                                fullWidth
                                isDisabled
                                value={chat.name ?? ''}
                                variant="secondary"
                            >
                                <Label>Channel name</Label>
                                <Input type="text" />
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
                                    autoFocus
                                    maxLength={channelDescriptionMaxLength}
                                    placeholder="What this channel is for"
                                    rows={3}
                                />
                            </TextField>
                            <SettingsRowError>{updateChannel.error?.message}</SettingsRowError>
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
