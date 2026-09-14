import { Button, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import type { ReactNode } from 'react';
import type { McpDestructiveAction } from './mcp-connection-actions.tsx';
import type { McpConnection } from './mcp-server-shared.ts';

/**
 * Named rows, the way Computer Management does it. An overflow menu in a dialog
 * corner hides these behind a guess.
 *
 * Every row here carries one small button, so the group reads as one kind of
 * control rather than a third button style competing with the footer pair.
 */
export function McpManageGroup({
    connection,
    onAddAccount,
    onDestructiveAction,
    saving,
}: {
    connection: McpConnection;
    onAddAccount: () => void;
    onDestructiveAction: (action: McpDestructiveAction) => void;
    saving: boolean;
}) {
    // Nothing to sign out of when the server takes no credentials.
    const canDisconnect = connection.connected && connection.auth !== 'none';

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Manage</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                {connection.preset ? (
                    <ManageRow title="Add another account">
                        <Button
                            isDisabled={saving}
                            onPress={onAddAccount}
                            size="sm"
                            variant="secondary"
                        >
                            Add
                        </Button>
                    </ManageRow>
                ) : null}
                {canDisconnect ? (
                    <>
                        {connection.preset ? <Separator /> : null}
                        <ManageRow
                            description="Clears saved credentials and Agent access."
                            title="Disconnect account"
                        >
                            <Button
                                onPress={() => onDestructiveAction('disconnect')}
                                size="sm"
                                variant="danger-soft"
                            >
                                Disconnect
                            </Button>
                        </ManageRow>
                    </>
                ) : null}
                {connection.preset || canDisconnect ? <Separator /> : null}
                <ManageRow
                    description="Removes this MCP and its credentials from this Server."
                    title="Remove from Haus"
                >
                    <Button
                        onPress={() => onDestructiveAction('delete')}
                        size="sm"
                        variant="danger-soft"
                    >
                        Remove
                    </Button>
                </ManageRow>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

function ManageRow({
    children,
    description,
    title,
}: {
    children: ReactNode;
    description?: string;
    title: string;
}) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>{title}</ItemCard.Title>
                {/* Only where the row destroys something; one clause, no more. */}
                {description ? (
                    <ItemCard.Description className="whitespace-normal">
                        {description}
                    </ItemCard.Description>
                ) : null}
            </ItemCard.Content>
            <ItemCard.Action>{children}</ItemCard.Action>
        </ItemCard>
    );
}
