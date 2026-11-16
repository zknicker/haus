import type { Agent } from '@haus/api';
import { Switch } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { useAgentConnectionAdmin } from '../../../hooks/members/use-agent-connection-admin.ts';

/**
 * The Permissions page: what this Agent may manage for other Agents, one row
 * per power. Today that is the connection admin role: an Owner or Admin lets
 * this Agent turn connection access on and off for every Agent
 * (`haus connection`). Members never see the page; the Server refuses them anyway.
 */
export function AgentPermissions({
    agent,
    canManage,
    serverId,
}: {
    agent: Agent;
    /** Owner or Admin. Anyone else gets nothing at all, not a disabled list. */
    canManage: boolean;
    serverId: string;
}) {
    if (!canManage) {
        return null;
    }
    // Its heading repeats the page's trail, as every sibling section's does.
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Permissions</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ManageConnectionsRow agent={agent} serverId={serverId} />
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

/** The one permission row today; a later power is another row like it. */
function ManageConnectionsRow({ agent, serverId }: { agent: Agent; serverId: string }) {
    const admin = useAgentConnectionAdmin(serverId, agent.id);

    return (
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
    );
}
