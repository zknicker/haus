import type { ServerMember, ServerMemberDirectory } from '@haus/api/membership';
import { canManageServerInvitations } from '@haus/api/membership';
import { DataGrid } from '@heroui-pro/react';
import { Label, ListBox, SearchField, Select } from '@heroui/react';
import * as React from 'react';
import { useMembershipActions } from '../../hooks/servers/use-membership-actions.ts';
import {
    useServerInvitationCommands,
    useServerInvitations,
} from '../../hooks/servers/use-server-invitations.ts';
import { SettingsPageColumn } from '../settings/layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../settings/layout/settings-page-header.tsx';
import { InvitePopover } from './invite-popover.tsx';
import { memberColumns } from './member-columns.tsx';
import {
    buildMemberRows,
    type MemberRoleFilter,
    memberRoleFilters,
} from './members-table-model.ts';
import { memberChangeDescription, type ServerMemberRowAction } from './server-member-actions.ts';
import {
    type PendingMemberChange,
    ServerMemberConfirmDialog,
} from './server-member-confirm-dialog.tsx';

export function MembersPage({
    directory,
    serverId,
    serverSlug,
}: {
    directory: ServerMemberDirectory | undefined;
    serverId: string;
    serverSlug: string;
}) {
    const canInvite = directory ? canManageServerInvitations(directory.viewerRole) : false;
    const invitations = useServerInvitations(serverId, canInvite);
    const { revoke } = useServerInvitationCommands();
    const commands = useMembershipActions(serverId);
    const [query, setQuery] = React.useState('');
    const [role, setRole] = React.useState<MemberRoleFilter>('all');
    const [pending, setPending] = React.useState<PendingMemberChange | null>(null);

    if (!directory) {
        return (
            <div aria-busy="true" className="min-h-32">
                <span className="sr-only">Loading members</span>
            </div>
        );
    }

    const columns = memberColumns({
        actions: {
            onChoose: (member, action) =>
                setPending(
                    buildPendingChange(member, action, serverSlug, commands, () => setPending(null))
                ),
            onRevoke: (invitationId) => revoke.mutate({ invitationId, serverId }),
        },
        directory,
        serverSlug,
    });
    const rows = buildMemberRows({
        directory,
        invitations: invitations.data ?? [],
        query,
        role,
    });
    const commandError =
        commands.changeRole.error?.message ??
        commands.remove.error?.message ??
        commands.leave.error?.message ??
        revoke.error?.message ??
        invitations.error?.message ??
        null;

    return (
        <SettingsPageColumn width="table">
            <SettingsPageHeader title="Members" />
            <div className="flex flex-wrap items-center gap-2">
                <SearchField
                    aria-label="Search members"
                    className="w-64 max-w-full"
                    onChange={setQuery}
                    value={query}
                >
                    <SearchField.Group>
                        <SearchField.SearchIcon />
                        <SearchField.Input placeholder="Search by name or email" />
                        <SearchField.ClearButton />
                    </SearchField.Group>
                </SearchField>
                <RoleFilter onChange={setRole} role={role} withPending={canInvite} />
                {canInvite ? (
                    <div className="ms-auto">
                        <InvitePopover serverId={serverId} />
                    </div>
                ) : null}
            </div>
            <DataGrid
                aria-label="Members"
                columns={columns}
                data={rows}
                getRowId={(row) => row.id}
                renderEmptyState={() => (
                    <p className="text-muted py-8 text-center text-sm">No members match.</p>
                )}
            />
            {commandError ? (
                <p className="text-danger text-sm" role="alert">
                    {commandError}
                </p>
            ) : null}
            <ServerMemberConfirmDialog
                onOpenChange={(open) => {
                    if (!open) {
                        setPending(null);
                    }
                }}
                pending={pending}
                slug={serverSlug}
            />
        </SettingsPageColumn>
    );
}

function RoleFilter({
    onChange,
    role,
    withPending,
}: {
    onChange: (role: MemberRoleFilter) => void;
    role: MemberRoleFilter;
    withPending: boolean;
}) {
    const options = memberRoleFilters.filter((option) => withPending || option.id !== 'pending');
    return (
        <Select
            aria-label="Filter by role"
            className="w-36"
            onChange={(value) => {
                const next = options.find((option) => option.id === value);
                if (next) {
                    onChange(next.id);
                }
            }}
            value={role}
        >
            <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
                <ListBox>
                    {options.map((option) => (
                        <ListBox.Item id={option.id} key={option.id} textValue={option.label}>
                            <Label>{option.label}</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </Select.Popover>
        </Select>
    );
}

function buildPendingChange(
    member: ServerMember,
    action: ServerMemberRowAction,
    slug: string,
    commands: ReturnType<typeof useMembershipActions>,
    done: () => void
) {
    const serverId = commands.serverId ?? '';
    const shared = {
        description: memberChangeDescription(member, action, slug),
        label: action.label,
        requiresSlug: action.requiresSlug,
    };

    if (action.kind === 'leave') {
        return {
            ...shared,
            run: (confirmation) => {
                commands.leave.mutate({ confirmation, serverId });
                done();
            },
        } satisfies PendingMemberChange;
    }

    if (action.kind === 'remove') {
        return {
            ...shared,
            run: (confirmation) => {
                commands.remove.mutate({ confirmation, serverId, userId: member.userId });
                done();
            },
        } satisfies PendingMemberChange;
    }

    const nextRole = action.nextRole ?? member.role;

    return {
        ...shared,
        run: (confirmation) => {
            commands.changeRole.mutate({
                confirmation: action.requiresSlug ? confirmation : undefined,
                role: nextRole,
                serverId,
                userId: member.userId,
            });
            done();
        },
    } satisfies PendingMemberChange;
}
