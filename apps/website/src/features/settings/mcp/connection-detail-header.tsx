import { Button, Dropdown, Label } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { ConnectionGlyph } from './connection-mark.tsx';
import type { McpConnection } from './mcp-server-shared.ts';

/**
 * The connection page's identity and its page-level actions, laid out like a
 * product page: the mark on its own line, then the name with a quiet menu
 * and — only while the connection still needs credentials — the one primary
 * action that finishes setup. Account actions belong to the account card.
 *
 * The title takes the settings page title role (`SettingsPageHeader`), but
 * the header is its own: that one insets to the row text of padded groups,
 * and this page's sections sit flush on the column edge.
 */
export function ConnectionDetailHeader({
    connection,
    onAddCredentials,
    onRefresh,
    onRemove,
    onSignIn,
    saving,
    signingIn,
    usesToken,
}: {
    connection: McpConnection;
    onAddCredentials: () => void;
    onRefresh: () => void;
    onRemove: () => void;
    onSignIn: () => void;
    saving: boolean;
    signingIn: boolean;
    /** A bearer-token preset (X): its credentials are one pasted token. */
    usesToken: boolean;
}) {
    return (
        <header className="flex flex-col gap-5">
            <span className="connection-hero-mark">
                <ConnectionGlyph connection={connection} />
            </span>
            <div className="flex min-w-0 items-center gap-2">
                <h1 className="min-w-0 flex-1 truncate font-semibold text-2xl text-foreground tracking-tight">
                    {connection.name}
                </h1>
                <Dropdown>
                    <Button
                        aria-label={`${connection.name} actions`}
                        isIconOnly
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                    </Button>
                    <Dropdown.Popover placement="bottom end">
                        <Dropdown.Menu>
                            <Dropdown.Item
                                id="refresh"
                                isDisabled={!connection.connected}
                                onAction={onRefresh}
                                textValue="Refresh tools"
                            >
                                <Label>Refresh tools</Label>
                            </Dropdown.Item>
                            <Dropdown.Item
                                id="remove"
                                onAction={onRemove}
                                textValue="Remove from Haus"
                                variant="danger"
                            >
                                <Label>Remove from Haus</Label>
                            </Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown.Popover>
                </Dropdown>
                {connection.connected ? null : (
                    <SetupAction
                        connection={connection}
                        onAddCredentials={onAddCredentials}
                        onSignIn={onSignIn}
                        saving={saving}
                        signingIn={signingIn}
                        usesToken={usesToken}
                    />
                )}
            </div>
            {/* The server's own words about itself; its address is a fact
                below, so a server that says nothing gets no line here. */}
            {connection.summary ? (
                <p className="text-foreground text-sm">{connection.summary}</p>
            ) : null}
        </header>
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
    if (connection.auth === 'headers') {
        return (
            <Button isDisabled={saving} onPress={onAddCredentials} size="sm">
                {usesToken ? 'Add token' : 'Add credentials'}
            </Button>
        );
    }
    return null;
}
