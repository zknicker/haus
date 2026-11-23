import { ItemCard } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import { PlugSocketIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useConnections } from '../../../hooks/servers/use-connections.ts';
import { SettingsCardGrid, SettingsGridCard } from '../layout/settings-card-grid.tsx';
import { SettingsEmptyState } from '../layout/settings-empty.tsx';
import { SettingsStatusChip, SettingsStatusTitle } from '../layout/settings-row-title.tsx';
import { SettingsRowError } from '../layout/settings-text.tsx';
import { ConnectionGlyph } from './connection-mark.tsx';
import { toConnectionView } from './connection-view.tsx';
import { connectionStatusLabel, type McpConnection } from './mcp-server-shared.ts';

/**
 * What this Server is connected to, one row per account: the brand tile, the
 * name over its account, and status. The catalog of services to add sits
 * behind Explore connections, so the page leads with what is in place.
 */
export function ConnectionListSection({
    onExplore,
    onSelect,
    serverId,
}: {
    onExplore: () => void;
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
            action={
                items.length > 0 ? (
                    <Button onPress={onExplore} size="sm" variant="secondary">
                        Explore connections
                    </Button>
                ) : null
            }
            count={items.length > 0 ? items.length : undefined}
            layout="list"
            status={connectionsStatus({ connections, count: items.length, onExplore })}
            title="Connected"
        >
            {items.map((connection) => (
                <SettingsGridCard key={connection.id} onPress={() => onSelect(connection.id)}>
                    <ItemCard.Icon>
                        <ConnectionGlyph connection={connection} />
                    </ItemCard.Icon>
                    <ItemCard.Content>
                        <SettingsStatusTitle
                            status={
                                connection.connected ? null : (
                                    <SettingsStatusChip>
                                        {connectionStatusLabel(connection)}
                                    </SettingsStatusChip>
                                )
                            }
                        >
                            {connection.name}
                        </SettingsStatusTitle>
                        <ItemCard.Description className="max-w-full">
                            {connectionAccountLabel(connection)}
                        </ItemCard.Description>
                    </ItemCard.Content>
                </SettingsGridCard>
            ))}
        </SettingsCardGrid>
    );
}

function connectionsStatus({
    connections,
    count,
    onExplore,
}: {
    connections: ReturnType<typeof useConnections>;
    count: number;
    onExplore: () => void;
}) {
    if (connections.isPending && !connections.data) {
        return (
            <div aria-busy="true" className="min-h-32">
                <span className="sr-only">Loading connections</span>
            </div>
        );
    }
    if (connections.error && !connections.data) {
        return <SettingsRowError>{connections.error.message}</SettingsRowError>;
    }
    if (count === 0) {
        return (
            <SettingsEmptyState
                action={<Button onPress={onExplore}>Explore connections</Button>}
                description="Captains use connections to reach your tools and accounts."
                icon={PlugSocketIcon}
                title="Connect a service"
            />
        );
    }
    return null;
}

export function connectionAccountLabel(
    connection: Pick<McpConnection, 'accountLabel' | 'builtIn' | 'name'>
) {
    if (connection.accountLabel && !echoesName(connection.accountLabel, connection.name)) {
        return connection.accountLabel;
    }
    return connection.builtIn ? 'Built in' : 'Custom';
}

function echoesName(label: string, name: string) {
    return comparable(name).includes(comparable(label));
}

function comparable(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]/gu, '');
}
