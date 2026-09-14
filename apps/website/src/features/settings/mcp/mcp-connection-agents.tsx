import { Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import type { McpConnection } from './mcp-server-shared.ts';

/** Which Agents this Server has granted the connection to. One name per row. */
export function McpAgentAccessGroup({ connection }: { connection: McpConnection }) {
    const { affectedAgents } = connection;

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Agent Access</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="max-h-72 overflow-y-auto">
                {affectedAgents.length > 0 ? (
                    affectedAgents.map((agent, index) => (
                        <Fragment key={agent.id}>
                            {index > 0 ? <Separator /> : null}
                            <ItemCard>
                                <ItemCard.Content>
                                    <ItemCard.Title>{agent.name}</ItemCard.Title>
                                </ItemCard.Content>
                            </ItemCard>
                        </Fragment>
                    ))
                ) : (
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>No Agents have access yet</ItemCard.Title>
                        </ItemCard.Content>
                    </ItemCard>
                )}
            </ItemCardGroup>
        </ItemCardGroup>
    );
}
