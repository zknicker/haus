import type { Agent, McpConnection } from '@haus/api';
import { Separator, Switch } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import * as React from 'react';
import { ConnectionGlyph } from '../../features/settings/mcp/connection-mark.tsx';
import { useAgentConnectionAdmin } from '../../hooks/members/use-agent-connection-admin.ts';
import { useAgentGrant } from '../../hooks/members/use-agent-grant.ts';

export function AgentTools({
    agent,
    canManage,
    connections,
    serverId,
}: {
    agent: Agent;
    /** Owner or Admin: may make this Agent a connection admin. */
    canManage: boolean;
    connections: McpConnection[];
    serverId: string;
}) {
    const grant = useAgentGrant(serverId, agent.id);
    // Every connection a human can toggle here, granted or not — a different
    // set from `grantedAgentConnections`, which is what this Agent can actually
    // call and is the number the Overview tile and the peek carry.
    const toggleable = connections.filter(
        (connection) => connection.connected && connection.tools.length > 0
    );

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                {/* "Connections", the same noun as the Settings section these
                    rows come from — "Agent MCP Access" named the one concept
                    two ways. No count: a number beside a section title reads as
                    "this Agent has N", which is what the switches below already
                    say row by row, and the Overview tile owns that fact. */}
                <ItemCardGroup.Title>Connections</ItemCardGroup.Title>
                <ItemCardGroup.Description>
                    Choose which of this Server's MCP connections this Agent can use.
                </ItemCardGroup.Description>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                {toggleable.length === 0 ? (
                    // The quiet single-row empty every sibling section uses,
                    // not a centered EmptyState mid-list.
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Description>
                                No connections yet. Connect an MCP server in Settings → Connections.
                            </ItemCard.Description>
                        </ItemCard.Content>
                    </ItemCard>
                ) : (
                    toggleable.map((connection, index) => {
                        const checked = connection.grants.some(
                            (grant) => grant.agentId === agent.id
                        );
                        return (
                            <React.Fragment key={connection.id}>
                                {index > 0 ? <Separator /> : null}
                                {/* The Connections page's own row anatomy:
                                    mark, name, a varying fact — the URL and
                                    the "MCP" chip said the same thing on
                                    every row, and both live in Settings. */}
                                <ItemCard>
                                    <ItemCard.Icon>
                                        <ConnectionGlyph connection={connection} />
                                    </ItemCard.Icon>
                                    <ItemCard.Content>
                                        <ItemCard.Title>{connection.name}</ItemCard.Title>
                                        <ItemCard.Description>
                                            {connection.tools.length}{' '}
                                            {connection.tools.length === 1 ? 'tool' : 'tools'}
                                        </ItemCard.Description>
                                    </ItemCard.Content>
                                    <ItemCard.Action>
                                        <Switch
                                            aria-label={`Enable ${connection.name} for ${agent.displayName}`}
                                            isDisabled={grant.isPending}
                                            isSelected={checked}
                                            onChange={(enabled) =>
                                                grant.setGrant(connection.id, enabled)
                                            }
                                        >
                                            <Switch.Content>
                                                <Switch.Control>
                                                    <Switch.Thumb />
                                                </Switch.Control>
                                            </Switch.Content>
                                        </Switch>
                                    </ItemCard.Action>
                                </ItemCard>
                            </React.Fragment>
                        );
                    })
                )}
            </ItemCardGroup>
            {canManage ? <ConnectionAdminCard agent={agent} serverId={serverId} /> : null}
        </ItemCardGroup>
    );
}

/**
 * The connection admin role: an Owner or Admin lets this Agent manage the switches above for
 * every Agent (`haus connection`). Members never see it; the Server refuses them anyway.
 */
function ConnectionAdminCard({ agent, serverId }: { agent: Agent; serverId: string }) {
    const admin = useAgentConnectionAdmin(serverId, agent.id);

    return (
        <ItemCardGroup className="overflow-hidden">
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Connection admin</ItemCard.Title>
                    <ItemCard.Description>
                        Can turn connection access on and off for any agent
                    </ItemCard.Description>
                </ItemCard.Content>
                <ItemCard.Action>
                    <Switch
                        aria-label={`Make ${agent.displayName} a connection admin`}
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
    );
}
