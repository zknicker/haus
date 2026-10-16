import type { Agent } from '@haus/api';
import { Separator, Switch } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { useAgentGrant } from '../../../hooks/members/use-agent-grant.ts';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import type {
    AgentAccessExtension,
    AgentAccessRowExtension,
} from '../connections/built-in/built-in-connection-definition.ts';
import { BuiltInAgentAccess } from '../connections/built-in/built-in-connection-sections.tsx';
import { ConnectionSection } from './connection-section.tsx';
import type { McpConnection } from './mcp-server-shared.ts';

/**
 * Which of this Server's Agents may use the connection, one switch per Agent.
 * Haus Server refuses a new grant until the connection is signed in, so an
 * off switch waits for that; an on switch can always be turned off. A
 * built-in definition may add a line, a per-row description (its state and
 * controls; the trailing side stays the switch), a panel under a row, and footer
 * rows, so its per-Agent state shares this one list.
 */
export function McpAgentAccessSection({
    connection,
    serverId,
}: {
    connection: McpConnection;
    serverId: string;
}) {
    return (
        <BuiltInAgentAccess connection={connection} serverId={serverId}>
            {(extension) => (
                <AgentAccessList
                    connection={connection}
                    extension={extension}
                    serverId={serverId}
                />
            )}
        </BuiltInAgentAccess>
    );
}

function AgentAccessList({
    connection,
    extension,
    serverId,
}: {
    connection: McpConnection;
    extension: AgentAccessExtension | null;
    serverId: string;
}) {
    const agents = useAgents(serverId).data ?? [];
    const granted = new Set(connection.affectedAgents.map((agent) => agent.id));

    return (
        <ConnectionSection description={extension?.description} title="Agent Access">
            <ItemCardGroup variant="outline">
                {agents.length > 0 ? (
                    agents.map((agent, index) => (
                        <Fragment key={agent.id}>
                            {index > 0 ? <Separator /> : null}
                            <AgentAccessRow
                                agent={agent}
                                connection={connection}
                                extension={extension?.row(agent, granted.has(agent.id)) ?? {}}
                                granted={granted.has(agent.id)}
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
                {extension?.footer && agents.length > 0 ? (
                    <>
                        <Separator />
                        {extension.footer}
                    </>
                ) : null}
            </ItemCardGroup>
        </ConnectionSection>
    );
}

function AgentAccessRow({
    agent,
    connection,
    extension,
    granted,
    serverId,
}: {
    agent: Agent;
    connection: McpConnection;
    extension: AgentAccessRowExtension;
    granted: boolean;
    serverId: string;
}) {
    const grant = useAgentGrant(serverId, agent.id);

    return (
        <>
            <ItemCard>
                <EntityAvatar name={agent.displayName} size="sm" src={agent.avatarUrl} />
                <ItemCard.Content>
                    <ItemCard.Title>{agent.displayName}</ItemCard.Title>
                    {extension.description ? (
                        <ItemCard.Description className="max-w-full truncate">
                            {extension.description}
                        </ItemCard.Description>
                    ) : null}
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
            {extension.detail}
        </>
    );
}
