import { Button, Chip, Tooltip } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { PlusSignIcon } from '@hugeicons-pro/core-stroke-rounded';
import type React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useConnections } from '../../../hooks/servers/use-connections.ts';
import {
    SettingsCardGrid,
    SettingsGridCard,
    SettingsGridCheck,
} from '../layout/settings-card-grid.tsx';
import { ConnectionGlyph } from './connection-mark.tsx';
import { toConnectionView } from './connection-view.tsx';
import { connectionStatusLabel, type McpConnection } from './mcp-server-shared.ts';

/**
 * The connections this Server has, on the same grid as Recommended and as
 * Settings → Skills. Each row is name, account, and status; the server's
 * address lives in the detail dialog the row opens.
 */
export function ConnectionListSection({
    onAdd,
    onSelect,
    serverId,
}: {
    onAdd: () => void;
    onSelect: (connectionId: string) => void;
    serverId: string;
}) {
    const connections = useConnections(serverId);
    const agents = useAgents(serverId);
    const items = (connections.data ?? []).map((connection) =>
        toConnectionView(connection, agents.data ?? [])
    );

    return (
        <SettingsCardGrid
            // Adding a connection adds a row to this grid, so the control
            // belongs to the section rather than the page.
            action={
                <Tooltip delay={0}>
                    <Button
                        aria-label="Add MCP Server"
                        isIconOnly
                        onPress={onAdd}
                        size="sm"
                        variant="secondary"
                    >
                        <Icon aria-hidden="true" icon={PlusSignIcon} size={16} />
                    </Button>
                    <Tooltip.Content>Add MCP Server</Tooltip.Content>
                </Tooltip>
            }
            count={connections.data ? items.length : undefined}
            status={connectionsStatus(connections, items.length)}
            title="Added MCPs"
        >
            {items.map((connection) => (
                <SettingsGridCard key={connection.id} onPress={() => onSelect(connection.id)}>
                    <ItemCard.Icon>
                        <ConnectionGlyph connection={connection} />
                    </ItemCard.Icon>
                    <ItemCard.Content>
                        <ItemCard.Title>{connection.name}</ItemCard.Title>
                        <ItemCard.Description className="max-w-full">
                            {connectionAccountLabel(connection)}
                        </ItemCard.Description>
                    </ItemCard.Content>
                    {/* A ready connection needs nothing, so it takes the
                        catalog's quiet check; only one that needs attention
                        spells out its status. */}
                    {connection.connected ? (
                        <SettingsGridCheck label={connectionStatusLabel(connection)} />
                    ) : (
                        <ItemCard.Action>
                            <Chip size="sm" variant="soft">
                                {connectionStatusLabel(connection)}
                            </Chip>
                        </ItemCard.Action>
                    )}
                </SettingsGridCard>
            ))}
        </SettingsCardGrid>
    );
}

function connectionsStatus(
    connections: ReturnType<typeof useConnections>,
    count: number
): React.ReactNode {
    if (connections.isPending && !connections.data) {
        // Blank while loading: no skeleton, no flash of empty.
        return (
            <div aria-busy="true" className="min-h-32">
                <span className="sr-only">Loading MCP connections</span>
            </div>
        );
    }
    if (connections.error && !connections.data) {
        return (
            <p className="py-8 text-center text-danger text-sm" role="alert">
                {connections.error.message}
            </p>
        );
    }
    if (count === 0) {
        return <p className="py-8 text-center text-muted text-sm">No connections.</p>;
    }
    return null;
}

function connectionAccountLabel(connection: McpConnection): string {
    if (connection.accountLabel) {
        return connection.accountLabel;
    }
    return connection.builtIn ? 'Built in' : 'Custom';
}
