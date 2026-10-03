import { Avatar, Button, Dropdown, Label, Separator, Spinner } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Add01Icon, MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { SettingsGridCard } from '../layout/settings-card-grid.tsx';
import { ConnectionSection } from './connection-section.tsx';
import { connectionStatusLabel, type McpConnection } from './mcp-server-shared.ts';

/**
 * The account this connection signs in as, on one bordered card. Account-level
 * actions live on the account row's own menu; adding another account of a
 * built-in service is the card's last row. A server that takes no credentials
 * has no account, so it renders no section.
 */
export function McpAccountSection({
    connection,
    onAddAccount,
    onDisconnect,
    onReauthorize,
    saving,
    usesToken,
}: {
    connection: McpConnection;
    onAddAccount: () => void;
    onDisconnect: () => void;
    /** Signs in again (OAuth) or replaces saved credentials (headers). */
    onReauthorize: () => void;
    saving: boolean;
    /** A bearer-token preset (X): reauthorizing replaces its token. */
    usesToken: boolean;
}) {
    if (connection.auth === 'none') {
        return null;
    }

    return (
        <ConnectionSection title="Connected Account">
            <ItemCardGroup variant="outline">
                {connection.connected ? (
                    <AccountRow
                        connection={connection}
                        onDisconnect={onDisconnect}
                        onReauthorize={onReauthorize}
                        usesToken={usesToken}
                    />
                ) : (
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Description>
                                {connectionStatusLabel(connection)}
                            </ItemCard.Description>
                        </ItemCard.Content>
                    </ItemCard>
                )}
                {connection.preset ? (
                    <>
                        <Separator />
                        <AddAccountRow isPending={saving} onPress={onAddAccount} />
                    </>
                ) : null}
            </ItemCardGroup>
        </ConnectionSection>
    );
}

function AccountRow({
    connection,
    onDisconnect,
    onReauthorize,
    usesToken,
}: {
    connection: McpConnection;
    onDisconnect: () => void;
    onReauthorize: () => void;
    usesToken: boolean;
}) {
    const status = connectionStatusLabel(connection);
    const reauthorize = reauthorizeLabel(connection, usesToken);

    return (
        <ItemCard>
            <EntityAvatar name={connection.accountLabel ?? connection.name} size="sm" />
            <ItemCard.Content>
                <ItemCard.Title title={connection.accountLabel ?? undefined}>
                    {connection.accountLabel ?? status}
                </ItemCard.Title>
                {connection.accountLabel ? (
                    <ItemCard.Description>Connected</ItemCard.Description>
                ) : null}
            </ItemCard.Content>
            <ItemCard.Action>
                <Dropdown>
                    <Button aria-label="Account actions" isIconOnly size="sm" variant="ghost">
                        <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                    </Button>
                    <Dropdown.Popover placement="bottom end">
                        <Dropdown.Menu>
                            <Dropdown.Item
                                id="reauthorize"
                                onAction={onReauthorize}
                                textValue={reauthorize}
                            >
                                <Label>{reauthorize}</Label>
                            </Dropdown.Item>
                            <Dropdown.Item
                                id="disconnect"
                                onAction={onDisconnect}
                                textValue="Disconnect account"
                                variant="danger"
                            >
                                <Label>Disconnect account</Label>
                            </Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown.Popover>
                </Dropdown>
            </ItemCard.Action>
        </ItemCard>
    );
}

/**
 * The whole row is the control, on the Settings pressable-row anatomy. Its
 * mark is the account row's avatar box (stock `Avatar` at `sm`, so box and
 * radius stay paired) holding a plus, so both titles start on one line. While
 * an add is in flight the plus turns to a spinner and presses are ignored.
 */
function AddAccountRow({ isPending, onPress }: { isPending: boolean; onPress: () => void }) {
    return (
        <SettingsGridCard onPress={isPending ? () => undefined : onPress}>
            <Avatar aria-hidden="true" size="sm">
                <Avatar.Fallback>
                    {isPending ? (
                        <Spinner color="current" size="sm" />
                    ) : (
                        <Icon aria-hidden="true" icon={Add01Icon} size={16} />
                    )}
                </Avatar.Fallback>
            </Avatar>
            <ItemCard.Content>
                <ItemCard.Title>Add another account</ItemCard.Title>
            </ItemCard.Content>
        </SettingsGridCard>
    );
}

function reauthorizeLabel(connection: McpConnection, usesToken: boolean) {
    if (connection.auth === 'oauth') {
        return 'Sign in again';
    }
    return usesToken ? 'Replace token' : 'Replace credentials';
}
