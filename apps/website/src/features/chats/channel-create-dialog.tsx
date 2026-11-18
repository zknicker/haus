import { Button, FieldError, Form, InputGroup, Label, Modal, TextField } from '@heroui/react';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import {
    type ChannelAgentOption,
    ChannelAgentPicker,
    normalizeChannelAgentIds,
} from './channel-agent-picker.tsx';
import type { ChannelAppearance } from './channel-appearance-fields.tsx';
import { ChannelAppearancePicker } from './channel-appearance-picker.tsx';
import { ChannelDialogError } from './channel-dialog-error.tsx';
import { channelHandleIssue } from './channel-handle.ts';

interface ChannelCreateDialogProps {
    agents: ChannelAgentOption[];
    agentsPending: boolean;
    errorMessage: string | null;
    isPending: boolean;
    onClose: () => void;
    onSubmit: (input: {
        agentIds: string[];
        color: string | null;
        icon: string | null;
        name: string;
    }) => Promise<void>;
    open: boolean;
}

/** New channel: its name and face in one field, then the Agents it starts with. */
export function ChannelCreateDialog({ open, onClose, ...form }: ChannelCreateDialogProps) {
    return (
        <Modal.Backdrop
            isDismissable
            isOpen={open}
            onOpenChange={(nextOpen) => !nextOpen && onClose()}
        >
            <Modal.Container>
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    {/* Mounted only while open so a dismissed draft never
                        reappears in the next channel. */}
                    {open ? <ChannelCreateForm {...form} /> : null}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

type ChannelCreateFormProps = Omit<ChannelCreateDialogProps, 'onClose' | 'open'>;

function ChannelCreateForm({
    agents,
    agentsPending,
    errorMessage,
    isPending,
    onSubmit,
}: ChannelCreateFormProps) {
    const [name, setName] = React.useState('');
    const [appearance, setAppearance] = React.useState<ChannelAppearance>({
        color: null,
        icon: null,
    });
    const [selectedAgentIds, setSelectedAgentIds] = React.useState<string[]>([]);
    const trimmedName = name.trim();
    const agentIds = normalizeChannelAgentIds(selectedAgentIds);
    const handleIssue = channelHandleIssue(name);
    const canSubmit = trimmedName.length > 0 && !handleIssue && agentIds.length > 0 && !isPending;

    // Seed a default agent once; after that the selection is the user's,
    // including an empty one (Create just disables).
    const seededDefaultAgent = React.useRef(false);
    React.useEffect(() => {
        if (seededDefaultAgent.current || agents.length === 0) {
            return;
        }

        seededDefaultAgent.current = true;
        setSelectedAgentIds([agents[0]?.id ?? ''].filter(Boolean));
    }, [agents]);

    const handleSubmit = React.useEffectEvent(async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!canSubmit) {
            return;
        }

        await onSubmit({
            agentIds,
            color: appearance.color,
            icon: appearance.icon,
            name: trimmedName,
        });
    });

    return (
        <>
            <Modal.Header>
                <Modal.Icon>
                    <ChannelIconBox color={appearance.color} icon={appearance.icon} size="modal" />
                </Modal.Icon>
                <Modal.Heading>New channel</Modal.Heading>
                <p className="text-muted text-sm leading-5">
                    Name the channel and choose its agents.
                </p>
            </Modal.Header>
            <Modal.Body>
                <Form
                    className="flex flex-col gap-6"
                    id="channel-create-form"
                    onSubmit={handleSubmit}
                >
                    {/* The channel's face lives inside its name field, so the
                        label spans the whole control instead of sitting inset
                        over the text box. */}
                    <TextField
                        fullWidth
                        isInvalid={Boolean(handleIssue)}
                        onChange={setName}
                        value={name}
                        variant="secondary"
                    >
                        <Label>Channel name</Label>
                        <InputGroup className="channel-name-field" fullWidth variant="secondary">
                            <InputGroup.Prefix className="ps-1">
                                <ChannelAppearancePicker
                                    appearance={appearance}
                                    isDisabled={isPending}
                                    onChange={setAppearance}
                                />
                            </InputGroup.Prefix>
                            <InputGroup.Input autoFocus placeholder="planning" type="text" />
                        </InputGroup>
                        {handleIssue ? <FieldError>{handleIssue}</FieldError> : null}
                    </TextField>
                    <ChannelAgentPicker
                        agents={agents}
                        agentsPending={agentsPending}
                        isDisabled={isPending}
                        label="visible"
                        onSelectedAgentIdsChange={setSelectedAgentIds}
                        selectedAgentIds={selectedAgentIds}
                    />
                    <ChannelDialogError message={errorMessage} />
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                <Button
                    form="channel-create-form"
                    isDisabled={!canSubmit}
                    isPending={isPending}
                    type="submit"
                >
                    Create
                </Button>
            </Modal.Footer>
        </>
    );
}
