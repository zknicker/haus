import type { Agent } from '@haus/api';
import { Switch } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { useAgentConnectionAdmin } from '../../../hooks/members/use-agent-connection-admin.ts';

/**
 * What this Agent may manage for other Agents. Today that is the connection admin role: an
 * Owner or Admin lets this Agent turn connection access on and off for every Agent
 * (`haus connection`). Members never see the section; the Server refuses them anyway.
 */
export function AgentPermissions({
    agent,
    canManage,
    serverId,
}: {
    agent: Agent;
    /** Owner or Admin. Anyone else gets no section at all, not a disabled one. */
    canManage: boolean;
    serverId: string;
}) {
    if (!canManage) {
        return null;
    }
    return <AgentPermissionsGroup agent={agent} serverId={serverId} />;
}

function AgentPermissionsGroup({ agent, serverId }: { agent: Agent; serverId: string }) {
    const admin = useAgentConnectionAdmin(serverId, agent.id);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Permissions</ItemCardGroup.Title>
                <ItemCardGroup.Description>
                    Choose what this Agent can manage for other Agents.
                </ItemCardGroup.Description>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Manage connections</ItemCard.Title>
                        <ItemCard.Description>
                            Can turn connection access on and off for any agent
                        </ItemCard.Description>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Switch
                            aria-label={`Let ${agent.displayName} manage connections`}
                            isDisabled={admin.isPending}
                            isSelected={agent.connectionAdmin}
                            onChange={admin.setConnectionAdmin}
                        >
                            <Switch.Content>
                                <Switch.Control>
                                    <Switch.Thumb />
                                </Switch.Control>
                            </Switch.Content>
                        </Switch>
                    </ItemCard.Action>
                </ItemCard>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}
