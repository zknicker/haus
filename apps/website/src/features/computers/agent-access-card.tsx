import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Dropdown, Label } from '@heroui/react';
import { PlusSignIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { useGrantAgentAccess, useRevokeAgentAccess } from '../../hooks/computer-access/use-agent-access.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useMembers } from '../../hooks/servers/use-members.ts';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import { humanDirectory } from '../servers/human-identity.ts';
import {
    type AccessCaptain,
    type AgentAccessView,
    agentAccessDescription,
    agentAccessView,
    homeCaptainsSummary,
} from './agent-access-model.ts';

/**
 * A Device's Agent access list (ADR 0057 decision 4): home Captains always
 * run tools here, and the attacher names any other Captain one at a time.
 */
export function AgentAccessCard({ computerId, serverId }: { computerId: string; serverId: string }) {
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);
    const agents = useAgents(serverId);
    const members = useMembers(serverId).data?.members;
    const grant = useGrantAgentAccess(serverId);
    const revoke = useRevokeAgentAccess(serverId);
    if (!(computer && agents.data)) {
        return null;
    }
    const view = agentAccessView({
        agents: agents.data,
        computerId,
        grants: computer.agentAccessGrants,
        personName: humanDirectory(members ?? []).name,
    });
    return (
        <AgentAccessSection
            canGrant={computer.canGrantAgentAccess}
            canRevoke={computer.canRevokeAgentAccess}
            isPending={grant.isPending || revoke.isPending}
            onGrant={(agentId) => {
                withSaveErrorToast(() =>
                    grant.mutateAsync({ agentId, computerId, serverId })
                ).catch(() => undefined);
            }}
            onRevoke={(agentId) => {
                withSaveErrorToast(() =>
                    revoke.mutateAsync({ agentId, computerId, serverId })
                ).catch(() => undefined);
            }}
            view={view}
        />
    );
}

export function AgentAccessSection({
    canGrant,
    canRevoke,
    isPending,
    onGrant,
    onRevoke,
    view,
}: {
    canGrant: boolean;
    canRevoke: boolean;
    isPending: boolean;
    onGrant: (agentId: string) => void;
    onRevoke: (agentId: string) => void;
    view: AgentAccessView;
}) {
    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <ItemCardGroup.Title>Agent access</ItemCardGroup.Title>
                        <ItemCardGroup.Description>{agentAccessDescription}</ItemCardGroup.Description>
                    </div>
                    {canGrant ? (
                        <CaptainPicker
                            candidates={view.candidates}
                            isDisabled={isPending}
                            onPick={onGrant}
                        />
                    ) : null}
                </ItemCardGroup.Header>
                <ItemCardGroup className="overflow-hidden">
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>Captains on this device</ItemCard.Title>
                            <ItemCard.Description className="whitespace-normal">
                                {homeCaptainsSummary(view.home)}
                            </ItemCard.Description>
                        </ItemCard.Content>
                    </ItemCard>
                    {view.granted.map((captain) => (
                        <ItemCard key={captain.id}>
                            <ItemCard.Content>
                                <ItemCard.Title>{captain.displayName}</ItemCard.Title>
                                <ItemCard.Description>Allowed by {captain.grantedBy}</ItemCard.Description>
                            </ItemCard.Content>
                            {canRevoke ? (
                                <ItemCard.Action>
                                    <Button
                                        aria-label={`Remove ${captain.displayName}`}
                                        isDisabled={isPending}
                                        onPress={() => onRevoke(captain.id)}
                                        size="sm"
                                        variant="secondary"
                                    >
                                        Remove
                                    </Button>
                                </ItemCard.Action>
                            ) : null}
                        </ItemCard>
                    ))}
                </ItemCardGroup>
            </ItemCardGroup>
        </section>
    );
}

function CaptainPicker({
    candidates,
    isDisabled,
    onPick,
}: {
    candidates: readonly AccessCaptain[];
    isDisabled: boolean;
    onPick: (agentId: string) => void;
}) {
    return (
        <Dropdown>
            <Button
                aria-label="Add Captain"
                isDisabled={isDisabled || candidates.length === 0}
                isIconOnly
                size="sm"
                variant="ghost"
            >
                <Icon aria-hidden="true" icon={PlusSignIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    {candidates.map((captain) => (
                        <Dropdown.Item
                            id={captain.id}
                            key={captain.id}
                            onAction={() => onPick(captain.id)}
                            textValue={captain.displayName}
                        >
                            <Label>{captain.displayName}</Label>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
