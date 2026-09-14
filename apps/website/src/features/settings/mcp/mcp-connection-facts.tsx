import { Chip, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { SettingsFact } from '../layout/settings-text.tsx';
import { connectionStatusLabel, type McpConnection } from './mcp-server-shared.ts';

/**
 * What the Server knows about this connection — a label on the left, one value
 * on the right, one row per fact. The chip here is the only place the
 * connection's state is spelled out, so the heading can carry the name alone.
 */
export function McpConnectionFacts({ connection }: { connection: McpConnection }) {
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Connection</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Status</ItemCard.Title>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Chip color={statusColor(connection)} size="sm" variant="soft">
                            {connectionStatusLabel(connection)}
                        </Chip>
                    </ItemCard.Action>
                </ItemCard>
                {connection.accountLabel ? (
                    <>
                        <Separator />
                        <ItemCard>
                            <ItemCard.Content className="shrink-0 basis-auto">
                                <ItemCard.Title>Account</ItemCard.Title>
                            </ItemCard.Content>
                            <ItemCard.Action className="min-w-0 shrink">
                                <SettingsFact
                                    className="block truncate"
                                    title={connection.accountLabel}
                                >
                                    {connection.accountLabel}
                                </SettingsFact>
                            </ItemCard.Action>
                        </ItemCard>
                    </>
                ) : null}
                <Separator />
                <ItemCard>
                    {/* The label keeps its own width and the address takes
                        whatever is left, truncating from the row's trailing
                        edge with the whole value in a title attribute. */}
                    <ItemCard.Content className="shrink-0 basis-auto">
                        <ItemCard.Title>Server</ItemCard.Title>
                    </ItemCard.Content>
                    <ItemCard.Action className="min-w-0 shrink">
                        <SettingsFact
                            className="block truncate text-right font-mono"
                            title={connection.url}
                        >
                            {connection.url}
                        </SettingsFact>
                    </ItemCard.Action>
                </ItemCard>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

/** A server that takes no credentials and still cannot answer is broken. */
function statusColor(connection: McpConnection) {
    if (connection.connected) {
        return 'success' as const;
    }
    return connection.auth === 'none' ? ('danger' as const) : ('default' as const);
}
