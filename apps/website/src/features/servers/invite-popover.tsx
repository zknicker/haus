import {
    Button,
    Description,
    FieldError,
    Form,
    Input,
    Label,
    Popover,
    TextField,
} from '@heroui/react';
import * as React from 'react';
import { CopyButton } from '../../components/copy-button.tsx';
import { useServerInvitationCommands } from '../../hooks/servers/use-server-invitations.ts';
import { invitationLink } from './server-routes.ts';

/**
 * Issuing an invitation, from the Members toolbar.
 *
 * Haus sends no email: the Server discloses the raw token once, in the
 * response to `create`, and the Owner or Admin passes it on however they
 * choose. Losing it means revoking and reissuing, so the popover holds the
 * issued link until it is dismissed on purpose rather than clearing itself.
 */
export function InvitePopover({ serverId }: { serverId: string }) {
    const [open, setOpen] = React.useState(false);
    const [email, setEmail] = React.useState('');
    const { create } = useServerInvitationCommands();
    const issued = create.data;

    // Closing is the reset, however it happens: the token is gone from the
    // client once this state clears, so reopening must never show a stale one.
    const close = () => {
        setOpen(false);
        setEmail('');
        create.reset();
    };

    return (
        <Popover isOpen={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
            <Button variant="secondary">Invite</Button>
            <Popover.Content className="w-[min(22rem,calc(100vw-2rem))]" placement="bottom end">
                <Popover.Dialog>
                    {issued ? (
                        <div className="flex flex-col gap-3">
                            <p className="text-foreground text-sm">
                                Send this link to {issued.invitation.email}. It is shown once.
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="text-muted min-w-0 flex-1 truncate font-mono text-xs">
                                    {invitationLink(issued.token)}
                                </code>
                                <CopyButton value={invitationLink(issued.token)} />
                            </div>
                            <div className="flex justify-end">
                                <Button onPress={close}>Done</Button>
                            </div>
                        </div>
                    ) : (
                        <Form
                            className="flex flex-col gap-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                create.mutate({ email, serverId });
                            }}
                        >
                            <TextField
                                autoFocus
                                fullWidth
                                isInvalid={Boolean(create.error)}
                                onChange={setEmail}
                                type="email"
                                value={email}
                                variant="secondary"
                            >
                                <Label>Email</Label>
                                <Input autoComplete="off" placeholder="name@example.com" />
                                <Description>
                                    They must accept while signed in with this exact verified
                                    address.
                                </Description>
                                <FieldError>{create.error?.message}</FieldError>
                            </TextField>
                            <div className="flex justify-end">
                                <Button
                                    isDisabled={create.isPending || email.trim().length === 0}
                                    type="submit"
                                >
                                    Invite
                                </Button>
                            </div>
                        </Form>
                    )}
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}
