import type { ServerInvitation, ServerInvitationStatus } from '@haus/api/membership';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Chip, Separator } from '@heroui/react';
import { Fragment } from 'react';
import {
    useServerInvitationCommands,
    useServerInvitations,
} from '../../hooks/servers/use-server-invitations.ts';
import { formatRelativeTime } from '../../lib/format.ts';
import { InvitePopover } from './invite-popover.tsx';

/**
 * Invitations on this Server, as a sibling of the Agents and Humans sections.
 *
 * The count is of live invitations only — a section header answers "how many
 * people are still expected", not "how many rows are below". Issuing lives
 * behind the header's `+`, because it acts on the section rather than on the
 * page; revoking lives on the row it acts on.
 *
 * With nothing issued the section is its header alone. The header already
 * carries the count and the way to add one, so an empty row beneath it would
 * only restate a zero that is already on screen.
 */
export function ServerInvitationsSection({ serverId }: { serverId: string }) {
    const invitations = useServerInvitations(serverId, true);
    const items = sortInvitations(invitations.data ?? []);
    const pending = items.filter((invitation) => invitation.status === 'pending').length;

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header className="flex items-center justify-between gap-3">
                <ItemCardGroup.Title>
                    Invitations
                    {invitations.data ? (
                        <span className="text-muted ms-2 tabular-nums">{pending}</span>
                    ) : null}
                </ItemCardGroup.Title>
                <InvitePopover serverId={serverId} />
            </ItemCardGroup.Header>
            {/* Blank while loading: this surface shows no skeletons. */}
            {!invitations.data && invitations.isPending ? (
                <div aria-busy="true" className="min-h-20">
                    <span className="sr-only">Loading invitations</span>
                </div>
            ) : invitations.error && !invitations.data ? (
                <p className="text-danger px-4 text-sm" role="alert">
                    {invitations.error.message}
                </p>
            ) : items.length > 0 ? (
                <InvitationList invitations={items} serverId={serverId} />
            ) : null}
        </ItemCardGroup>
    );
}

/** One row per invitation, with revocation on the live ones. */
function InvitationList({
    invitations,
    serverId,
}: {
    invitations: ServerInvitation[];
    serverId: string;
}) {
    const { revoke } = useServerInvitationCommands();

    return (
        <ItemCardGroup className="overflow-hidden">
            {invitations.map((invitation, index) => (
                <Fragment key={invitation.id}>
                    {index > 0 ? <Separator /> : null}
                    <ItemCard data-invitation-id={invitation.id}>
                        <ItemCard.Content>
                            <ItemCard.Title>{invitation.email}</ItemCard.Title>
                            <ItemCard.Description>
                                {`Invited ${formatRelativeTime(invitation.createdAt)} · expires ${expiryDate(invitation.expiresAt)}`}
                            </ItemCard.Description>
                        </ItemCard.Content>
                        <ItemCard.Action className="flex items-center gap-2">
                            <Chip
                                color={invitationStatus[invitation.status].color}
                                size="sm"
                                variant="soft"
                            >
                                <Chip.Label>{invitationStatus[invitation.status].label}</Chip.Label>
                            </Chip>
                            {invitation.status === 'pending' ? (
                                <Button
                                    isDisabled={revoke.isPending}
                                    onPress={() =>
                                        revoke.mutate({ invitationId: invitation.id, serverId })
                                    }
                                    size="sm"
                                    variant="danger-soft"
                                >
                                    Revoke
                                </Button>
                            ) : null}
                        </ItemCard.Action>
                    </ItemCard>
                </Fragment>
            ))}
        </ItemCardGroup>
    );
}

/**
 * Only `pending` is a live state, so it is the only one that earns a color;
 * the terminal three are history and read as neutral.
 */
const invitationStatus: Record<
    ServerInvitationStatus,
    { color: 'default' | 'success' | 'warning'; label: string }
> = {
    accepted: { color: 'success', label: 'Accepted' },
    expired: { color: 'default', label: 'Expired' },
    pending: { color: 'warning', label: 'Pending' },
    revoked: { color: 'default', label: 'Revoked' },
};

/** Live invitations first, then newest first — the ones still awaiting a person. */
export function sortInvitations(invitations: ServerInvitation[]): ServerInvitation[] {
    return [...invitations].sort((left, right) => {
        const livePending = Number(right.status === 'pending') - Number(left.status === 'pending');

        if (livePending !== 0) {
            return livePending;
        }

        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
}

/** The app's date rendering, for a deadline that is days rather than minutes away. */
function expiryDate(value: string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}
