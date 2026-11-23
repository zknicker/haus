import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Dropdown, Label } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { SettingsRowTitle } from '../layout/settings-row-title.tsx';
import { ConnectionSection } from './connection-section.tsx';
import {
    connectionSetupDescription,
    connectionStatusLabel,
    type McpConnection,
} from './mcp-server-shared.ts';

/**
 * The account this connection signs in as. A signed-in account is one row
 * with its own menu; until then the row states what is missing and carries
 * the one action that finishes setup. Adding another account of a built-in
 * service is the section header's control. A server that takes no
 * credentials has no account, so it renders no section.
 */
export function McpAccountSection({
    connection,
    onAddAccount,
    onAddCredentials,
    onDisconnect,
    onReauthorize,
    onSignIn,
    saving,
    signingIn,
    usesToken,
}: {
    connection: McpConnection;
    onAddAccount: () => void;
    onAddCredentials: () => void;
    onDisconnect: () => void;
    /** Signs in again (OAuth) or replaces saved credentials (headers). */
    onReauthorize: () => void;
    onSignIn: () => void;
    saving: boolean;
    signingIn: boolean;
    /** A bearer-token preset (X): its credentials are one pasted token. */
    usesToken: boolean;
}) {
    if (connection.auth === 'none') {
        return null;
    }

    return (
        <ConnectionSection
            action={
                connection.preset ? (
                    <Button
                        isDisabled={saving}
                        onPress={onAddAccount}
                        size="sm"
                        variant="secondary"
                    >
                        Add account
                    </Button>
                ) : null
            }
            title="Connected account"
        >
            <ItemCardGroup>
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
                            <SettingsRowTitle info={connectionSetupDescription(connection)}>
                                {connectionStatusLabel(connection)}
                            </SettingsRowTitle>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <SetupAction
                                connection={connection}
                                onAddCredentials={onAddCredentials}
                                onSignIn={onSignIn}
                                saving={saving}
                                signingIn={signingIn}
                                usesToken={usesToken}
                            />
                        </ItemCard.Action>
                    </ItemCard>
                )}
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

function SetupAction({
    connection,
    onAddCredentials,
    onSignIn,
    saving,
    signingIn,
    usesToken,
}: {
    connection: McpConnection;
    onAddCredentials: () => void;
    onSignIn: () => void;
    saving: boolean;
    signingIn: boolean;
    usesToken: boolean;
}) {
    if (connection.auth === 'oauth') {
        return (
            <Button isDisabled={saving} isPending={signingIn} onPress={onSignIn} size="sm">
                Sign in
            </Button>
        );
    }
    return (
        <Button isDisabled={saving} onPress={onAddCredentials} size="sm">
            {connection.preset === 'skool'
                ? 'Sign in'
                : usesToken
                  ? 'Add token'
                  : 'Add credentials'}
        </Button>
    );
}

function reauthorizeLabel(connection: McpConnection, usesToken: boolean) {
    if (connection.preset === 'skool') {
        return 'Reconnect Skool';
    }
    if (connection.auth === 'oauth') {
        return 'Sign in again';
    }
    return usesToken ? 'Replace token' : 'Replace credentials';
}
