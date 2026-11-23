import type { Agent } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Separator, Switch } from '@heroui/react';
import { Fragment } from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { useAgentGrant } from '../../../hooks/members/use-agent-grant.ts';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { SettingsEmptyRow } from '../layout/settings-empty.tsx';
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
    const granted = new Set(connection.affectedAgents.map((agent) => agent.id));

    return (
        <ConnectionSection title="Captain access">
            <ItemCardGroup>
                {agents.length > 0 ? (
                    agents.map((agent, index) => (
                        <Fragment key={agent.id}>
                            {index > 0 ? <Separator /> : null}
                            <AgentAccessRow
                                agent={agent}
                                connection={connection}
                                granted={granted.has(agent.id)}
                                serverId={serverId}
                            />
                        </Fragment>
                    ))
                ) : (
                    <SettingsEmptyRow>No Captains on this Server yet.</SettingsEmptyRow>
                )}
            </ItemCardGroup>
        </ConnectionSection>
    );
}

function AgentAccessRow({
    agent,
    connection,
    granted,
    serverId,
}: {
    agent: Agent;
    connection: McpConnection;
    granted: boolean;
    serverId: string;
}) {
    const grant = useAgentGrant(serverId, agent.id);

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
