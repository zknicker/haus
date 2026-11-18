import type { Chat } from '@haus/api';
import { Button, Form, Modal, toast } from '@heroui/react';
import * as React from 'react';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useChannelUpdate } from '../../hooks/servers/use-channel-update.ts';
import { ChannelAgentPicker, normalizeChannelAgentIds } from './channel-agent-picker.tsx';
import { ChannelDialogError } from './channel-dialog-error.tsx';

/** Which Agents sit in a channel. */
export function ChannelAgentsDialog({ chat, onClose }: { chat: Chat; onClose: () => void }) {
    const agents = useAgents(chat.serverId);
    const updateChannel = useChannelUpdate();
    const [selectedAgentIds, setSelectedAgentIds] = React.useState(() =>
        normalizeChannelAgentIds(chat.participantAgentIds)
    );
    const agentIds = normalizeChannelAgentIds(selectedAgentIds);
    const isUnchanged =
        agentIds.length === chat.participantAgentIds.length &&
        agentIds.every((agentId) => chat.participantAgentIds.includes(agentId));
    const canSubmit = agentIds.length > 0 && !(isUnchanged || updateChannel.isPending);

    const handleSubmit = React.useEffectEvent(async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!canSubmit) {
            return;
        }

        try {
            await updateChannel.mutateAsync({
                agentIds,
                chatId: chat.id,
                name: chat.name ?? '',
                serverId: chat.serverId,
            });
            toast.success('Channel agents updated');
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
                        <Modal.Heading>Channel agents</Modal.Heading>
                        <p className="text-muted text-sm leading-5">Who works in #{chat.name}.</p>
                    </Modal.Header>
                    <Modal.Body>
                        <Form
                            className="flex flex-col gap-4"
                            id="channel-agents-form"
                            onSubmit={handleSubmit}
                        >
                            <ChannelAgentPicker
                                agents={(agents.data ?? []).map((agent) => ({
                                    avatarUrl: agent.avatarUrl,
                                    id: agent.id,
                                    name: agent.displayName,
                                }))}
                                agentsPending={agents.isPending}
                                isDisabled={updateChannel.isPending}
                                label="hidden"
                                onSelectedAgentIdsChange={setSelectedAgentIds}
                                selectedAgentIds={selectedAgentIds}
                            />
                            <ChannelDialogError message={updateChannel.error?.message ?? null} />
                        </Form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button slot="close" type="button" variant="secondary">
                            Cancel
                        </Button>
                        <Button
                            form="channel-agents-form"
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
