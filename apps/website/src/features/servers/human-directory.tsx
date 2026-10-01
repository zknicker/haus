import type { Agent } from '@haus/api';
import type { ServerMember, ServerMemberDirectory } from '@haus/api/membership';
import { canManageServerInvitations } from '@haus/api/membership';
import { Button } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { PlusSignIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useOpenAgentProfile } from '../../hooks/agents/use-open-agent-profile.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useMembershipActions } from '../../hooks/servers/use-membership-actions.ts';
import { CreateAgentDialog } from '../members/create-agent-dialog.tsx';
import { SettingsPageHeader } from '../settings/layout/settings-page-header.tsx';
import { PageColumn } from '../shell/page-column.tsx';
import { ServerAgentList } from './server-agent-list.tsx';
import { ServerInvitationsSection } from './server-invitations.tsx';
import { memberChangeDescription, type ServerMemberRowAction } from './server-member-actions.ts';
import {
    type PendingMemberChange,
    ServerMemberConfirmDialog,
} from './server-member-confirm-dialog.tsx';
import { ServerMemberList } from './server-member-list.tsx';

export function HumanDirectory({
    canManage,
    directory,
    serverId,
    serverSlug,
}: {
    canManage: boolean;
    directory: ServerMemberDirectory | undefined;
    serverId: string;
    serverSlug: string;
}) {
    const openAgentProfile = useOpenAgentProfile();
    const canInvite = directory ? canManageServerInvitations(directory.viewerRole) : false;
    const commands = useMembershipActions(serverId);
    const agents = useAgents(serverId);
    const [pending, setPending] = React.useState<PendingMemberChange | null>(null);
    const [creatingAgent, setCreatingAgent] = React.useState(false);

    if (!directory) {
        return (
            <div aria-busy="true" className="min-h-32">
                <span className="sr-only">Loading humans</span>
            </div>
        );
    }

    const openChange = (member: ServerMember, action: ServerMemberRowAction) =>
        setPending(
            buildPendingChange(member, action, serverSlug, commands, () => setPending(null))
        );

    const commandError =
        commands.changeRole.error?.message ??
        commands.remove.error?.message ??
        commands.leave.error?.message ??
        null;

    return (
        <>
            <PageColumn>
                <SettingsPageHeader
                    description="The people on this Server, their roles, and open invitations."
                    title="Members"
                />
                <AgentsSection
                    agents={agents.data}
                    canManage={canManage}
                    onCreateAgent={() => setCreatingAgent(true)}
                />
                <ItemCardGroup variant="transparent">
                    <ItemCardGroup.Header>
                        <ItemCardGroup.Title>
                            Humans
                            <span className="ms-2 text-muted tabular-nums">
                                {directory.members.length}
                            </span>
                        </ItemCardGroup.Title>
                    </ItemCardGroup.Header>
                    <ItemCardGroup className="overflow-hidden">
                        <ServerMemberList
                            directory={directory}
                            onChoose={openChange}
                            serverSlug={serverSlug}
                        />
                    </ItemCardGroup>
                    {commandError ? (
                        <p className="px-4 text-danger text-sm">{commandError}</p>
                    ) : null}
                </ItemCardGroup>
                {canInvite ? <ServerInvitationsSection serverId={serverId} /> : null}
            </PageColumn>
            <ServerMemberConfirmDialog
                onOpenChange={(open) => {
                    if (!open) {
                        setPending(null);
                    }
                }}
                pending={pending}
                slug={serverSlug}
            />
            <CreateAgentDialog
                agents={agents.data ?? []}
                onCreated={(agentId) => {
                    setCreatingAgent(false);
                    openAgentProfile(agentId);
                }}
                onOpenChange={setCreatingAgent}
                open={creatingAgent}
                serverId={serverId}
            />
        </>
    );
}

/**
 * Agents come from their own query rather than the member directory, because
 * their membership lives on the agent record. Blank while loading — the app
 * shows no skeletons on synced surfaces.
 */
function AgentsSection({
    agents,
    canManage,
    onCreateAgent,
}: {
    agents: Agent[] | undefined;
    canManage: boolean;
    onCreateAgent: () => void;
}) {
    const items = agents ?? [];

    if (!agents) {
        return (
            <div aria-busy="true" className="min-h-24">
                <span className="sr-only">Loading Agents</span>
            </div>
        );
    }

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header className="flex flex-wrap items-center justify-between gap-3">
                <ItemCardGroup.Title>
                    Agents
                    <span className="ms-2 text-muted tabular-nums">{items.length}</span>
                </ItemCardGroup.Title>
                {canManage ? (
                    <Button
                        aria-label="Create agent"
                        isIconOnly
                        onPress={onCreateAgent}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={PlusSignIcon} size={16} />
                    </Button>
                ) : null}
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                {items.length === 0 ? (
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Description>
                                No Agents on this Server yet.
                            </ItemCard.Description>
                        </ItemCard.Content>
                    </ItemCard>
                ) : (
                    <ServerAgentList agents={items} />
                )}
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

function buildPendingChange(
    member: ServerMember,
    action: ServerMemberRowAction,
    slug: string,
    commands: ReturnType<typeof useMembershipActions>,
    done: () => void
): PendingMemberChange {
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
        };
    }

    if (action.kind === 'remove') {
        return {
            ...shared,
            run: (confirmation) => {
                commands.remove.mutate({ confirmation, serverId, userId: member.userId });
                done();
            },
        };
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
    };
}
