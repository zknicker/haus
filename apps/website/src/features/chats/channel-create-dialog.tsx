import { Button, FieldError, Form, InputGroup, Label, Modal, TextField } from '@heroui/react';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import type { ChannelAppearance } from './channel-appearance-fields.tsx';
import { ChannelAppearancePicker } from './channel-appearance-picker.tsx';
import { ChannelDialogError } from './channel-dialog-error.tsx';
import { channelHandleIssue } from './channel-handle.ts';

interface ChannelCreateDialogProps {
    errorMessage: string | null;
    isPending: boolean;
    onClose: () => void;
    onSubmit: (input: { color: string | null; icon: string | null; name: string }) => Promise<void>;
    open: boolean;
}

/** New channel: its name and face in one field. A new Project starts with no Agents. */
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

function ChannelCreateForm({ errorMessage, isPending, onSubmit }: ChannelCreateFormProps) {
    const [name, setName] = React.useState('');
    const [appearance, setAppearance] = React.useState<ChannelAppearance>({
        color: null,
        icon: null,
    });
    const trimmedName = name.trim();
    const handleIssue = channelHandleIssue(name);
    const canSubmit = trimmedName.length > 0 && !handleIssue && !isPending;

    const handleSubmit = React.useEffectEvent(async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!canSubmit) {
            return;
        }

        await onSubmit({
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
                <Modal.Heading>New project</Modal.Heading>
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
                        <Label>Project name</Label>
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
