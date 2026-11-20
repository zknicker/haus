import type { ServerMember, ServerMemberDirectory } from '@haus/api/membership';
import type { DataGridColumn } from '@heroui-pro/react';
import { Button, Chip, Description, Dropdown, Label } from '@heroui/react';
import { Mail01Icon, MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Link } from 'react-router-dom';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import type { MemberRow } from './members-table-model.ts';
import { type ServerMemberRowAction, serverMemberRowActions } from './server-member-actions.ts';
import { settingsHumanRoute } from './server-routes.ts';

export interface MemberColumnActions {
    onChoose: (member: ServerMember, action: ServerMemberRowAction) => void;
    onRevoke: (invitationId: string) => void;
}

export function memberColumns({
    actions,
    directory,
    serverSlug,
}: {
    actions: MemberColumnActions;
    directory: ServerMemberDirectory;
    serverSlug: string;
}) {
    return [
        {
            cell: (row) => <MemberName row={row} serverSlug={serverSlug} />,
            header: 'Name',
            id: 'name',
            isRowHeader: true,
            minWidth: 200,
        },
        {
            cell: (row) => <span className="text-muted">{row.email ?? '—'}</span>,
            header: 'Email',
            id: 'email',
            minWidth: 180,
        },
        {
            cell: (row) => (
                <Chip
                    color={row.kind === 'invitation' ? 'warning' : 'default'}
                    size="sm"
                    variant="soft"
                >
                    <Chip.Label className="capitalize">{row.status}</Chip.Label>
                </Chip>
            ),
            header: 'Role',
            id: 'role',
        },
        {
            cell: (row) => (
                <span className="text-muted tabular-nums">
                    {row.kind === 'invitation'
                        ? `Expires ${monthDay(row.invitation.expiresAt)}`
                        : monthYear(row.since)}
                </span>
            ),
            header: 'Joined',
            id: 'joined',
        },
        {
            align: 'end',
            cell: (row) =>
                row.kind === 'member' ? (
                    <MemberMenu
                        actions={serverMemberRowActions(directory, row.member)}
                        name={row.name}
                        onChoose={(action) => actions.onChoose(row.member, action)}
                    />
                ) : (
                    <InvitationMenu
                        email={row.email}
                        onRevoke={() => actions.onRevoke(row.invitation.id)}
                    />
                ),
            header: <span className="sr-only">Actions</span>,
            id: 'actions',
            width: 56,
        },
    ] satisfies DataGridColumn<MemberRow>[];
}

function MemberName({ row, serverSlug }: { row: MemberRow; serverSlug: string }) {
    if (row.kind === 'invitation') {
        return (
            <span className="flex min-w-0 items-center gap-2.5">
                <span className="bg-surface-secondary text-muted flex size-7 shrink-0 items-center justify-center rounded-full">
                    <Icon aria-hidden="true" icon={Mail01Icon} size={14} />
                </span>
                <span className="text-muted truncate">Invited</span>
            </span>
        );
    }
    return (
        <span className="flex min-w-0 items-center gap-2.5">
            <EntityAvatar name={row.name} size="sm" src={row.member.avatarUrl} />
            <Link
                className="text-foreground focus-visible:ring-focus min-w-0 truncate rounded-sm font-medium no-underline outline-none hover:underline focus-visible:ring-2"
                to={settingsHumanRoute(serverSlug, row.member.userId)}
            >
                {row.name}
            </Link>
            {row.isViewer ? <span className="text-muted shrink-0">you</span> : null}
        </span>
    );
}

function MemberMenu({
    actions,
    name,
    onChoose,
}: {
    actions: ServerMemberRowAction[];
    name: string;
    onChoose: (action: ServerMemberRowAction) => void;
}) {
    if (actions.length === 0) {
        return null;
    }
    return (
        <Dropdown>
            <Button aria-label={`Actions for ${name}`} isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    disabledKeys={actions
                        .filter((action) => action.disabledReason !== null)
                        .map((action) => action.kind)}
                    onAction={(key) => {
                        const action = actions.find((candidate) => candidate.kind === key);
                        if (action) {
                            onChoose(action);
                        }
                    }}
                >
                    {actions.map((action) => (
                        <Dropdown.Item
                            id={action.kind}
                            key={action.kind}
                            textValue={action.label}
                            variant={isDeparture(action) ? 'danger' : 'default'}
                        >
                            <Label>{action.label}</Label>
                            {action.disabledReason ? (
                                <Description>{action.disabledReason}</Description>
                            ) : null}
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

function InvitationMenu({ email, onRevoke }: { email: string; onRevoke: () => void }) {
    return (
        <Dropdown>
            <Button aria-label={`Actions for ${email}`} isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu onAction={onRevoke}>
                    <Dropdown.Item id="revoke" textValue="Revoke invitation" variant="danger">
                        <Label>Revoke invitation</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

function isDeparture(action: ServerMemberRowAction) {
    return action.kind === 'leave' || action.kind === 'remove';
}

function monthDay(value: string) {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(
        new Date(value)
    );
}

function monthYear(value: string) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(
        new Date(value)
    );
}
