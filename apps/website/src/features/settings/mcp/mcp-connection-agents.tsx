import type { Agent } from '@haus/api';
import { Separator, Switch } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { useAgentGrant } from '../../../hooks/members/use-agent-grant.ts';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { ConnectionSection } from './connection-section.tsx';
import type { McpConnection } from './mcp-server-shared.ts';

/**
 * Which of this Server's Agents may use the connection, one switch per Agent.
 * Haus Server refuses a new grant until the connection is signed in, so an
 * off switch waits for that; an on switch can always be turned off.
 */
export function McpAgentAccessSection({
    connection,
    serverId,
}: {
    connection: McpConnection;
    serverId: string;
}) {
    const agents = useAgents(serverId).data ?? [];

    return (
        <ConnectionSection title="Agent Access">
            <ItemCardGroup variant="outline">
                {agents.length > 0 ? (
                    agents.map((agent, index) => (
                        <Fragment key={agent.id}>
                            {index > 0 ? <Separator /> : null}
                            <AgentAccessRow
                                agent={agent}
                                connection={connection}
                                serverId={serverId}
                            />
                        </Fragment>
                    ))
                ) : (
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Description>
                                No Agents on this Server yet.
                            </ItemCard.Description>
                        </ItemCard.Content>
                    </ItemCard>
                )}
            </ItemCardGroup>
        </ConnectionSection>
    );
}

function AgentAccessRow({
    agent,
    connection,
    serverId,
}: {
    agent: Agent;
    connection: McpConnection;
    serverId: string;
}) {
    const grant = useAgentGrant(serverId, agent.id);
    const granted = connection.affectedAgents.some((granted) => granted.id === agent.id);

    return (
        <ItemCard>
            <EntityAvatar name={agent.displayName} size="sm" src={agent.avatarUrl} />
            <ItemCard.Content>
                <ItemCard.Title>{agent.displayName}</ItemCard.Title>
            </ItemCard.Content>
            <ItemCard.Action>
                <Switch
                    aria-label={`Enable ${connection.name} for ${agent.displayName}`}
                    isDisabled={grant.isPending || !(granted || connection.connected)}
                    isSelected={granted}
                    onChange={(enabled) => grant.setGrant(connection.id, enabled)}
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
