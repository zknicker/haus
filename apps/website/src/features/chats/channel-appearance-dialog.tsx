import type { Chat } from '@haus/api';
import { Button, Form, Modal, toast } from '@heroui/react';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { useChannelUpdate } from '../../hooks/servers/use-channel-update.ts';
import { type ChannelAppearance, ChannelAppearanceFields } from './channel-appearance-fields.tsx';
import { ChannelDialogError } from './channel-dialog-error.tsx';

/** A channel's icon and color, with the catalog open in the dialog itself. */
export function ChannelAppearanceDialog({ chat, onClose }: { chat: Chat; onClose: () => void }) {
    const updateChannel = useChannelUpdate();
    const [appearance, setAppearance] = React.useState<ChannelAppearance>({
        color: chat.color,
        icon: chat.icon,
    });
    const isUnchanged = appearance.color === chat.color && appearance.icon === chat.icon;
    const canSubmit = !(isUnchanged || updateChannel.isPending);

    const handleSubmit = React.useEffectEvent(async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!canSubmit) {
            return;
        }

        try {
            await updateChannel.mutateAsync({
                agentIds: chat.participantAgentIds,
                chatId: chat.id,
                color: appearance.color,
                icon: appearance.icon,
                name: chat.name ?? '',
                serverId: chat.serverId,
            });
            toast.success('Channel appearance updated');
            onClose();
        } catch {
            // The dialog stays open and shows the failure inline.
        }
    });

    return (
        <Modal.Backdrop isDismissable isOpen onOpenChange={(open) => !open && onClose()}>
            <Modal.Container>
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Icon>
                            <ChannelIconBox
                                color={appearance.color}
                                icon={appearance.icon}
                                size="modal"
                            />
                        </Modal.Icon>
                        <Modal.Heading>Icon &amp; color</Modal.Heading>
                        <p className="text-muted text-sm leading-5">
                            How #{chat.name} looks in the sidebar and across the app.
                        </p>
                    </Modal.Header>
                    <Modal.Body>
                        <Form
                            className="flex flex-col gap-2"
                            id="channel-appearance-form"
                            onSubmit={handleSubmit}
                        >
                            <ChannelAppearanceFields
                                appearance={appearance}
                                gridSize="tall"
                                onChange={setAppearance}
                            />
                            <ChannelDialogError message={updateChannel.error?.message ?? null} />
                        </Form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button slot="close" type="button" variant="secondary">
                            Cancel
                        </Button>
                        <Button
                            form="channel-appearance-form"
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
