import { EmptyState, ItemCard } from '@heroui-pro/react';
import { Button, Chip } from '@heroui/react';
import { Plug01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useConnections } from '../../../hooks/servers/use-connections.ts';
import { SettingsCardGrid, SettingsGridCard } from '../layout/settings-card-grid.tsx';
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
                        <ItemCard.Title>{connection.name}</ItemCard.Title>
                        <ItemCard.Description className="max-w-full">
                            {connectionAccountLabel(connection)}
                        </ItemCard.Description>
                    </ItemCard.Content>
                    {connection.connected ? null : (
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
        return (
            <p className="text-danger py-8 text-center text-sm" role="alert">
                {connections.error.message}
            </p>
        );
    }
    if (count === 0) {
        return (
            <EmptyState className="py-10">
                <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                        <Icon icon={Plug01Icon} />
                    </EmptyState.Media>
                    <EmptyState.Title>Connect a service</EmptyState.Title>
                    <EmptyState.Description>
                        Captains use connections to reach your tools and accounts.
                    </EmptyState.Description>
                </EmptyState.Header>
                <EmptyState.Content>
                    <Button onPress={onExplore}>Explore connections</Button>
                </EmptyState.Content>
            </EmptyState>
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
