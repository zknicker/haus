import { Button, Modal } from '@heroui/react';
import { useState } from 'react';
import { ConnectionGlyph } from './connection-mark.tsx';
import {
    ConnectionDestructiveDialog,
    type McpDestructiveAction,
} from './mcp-connection-actions.tsx';
import { McpAgentAccessGroup } from './mcp-connection-agents.tsx';
import { McpConnectionFacts } from './mcp-connection-facts.tsx';
import { McpManageGroup } from './mcp-connection-manage.tsx';
import { McpToolsGroup } from './mcp-connection-tools.tsx';
import { McpHeaderCredentialsDialog } from './mcp-header-credentials-dialog.tsx';
import type { McpConnection, McpConnectionTool } from './mcp-server-shared.ts';

export function McpConnectionDetailDialog({
    connection,
    onAddAccount,
    onDelete,
    onDisconnect,
    onOpenChange,
    onRefresh,
    onStartOAuth,
    onUpdateHeaders,
    open,
    saving,
    startingOAuthId,
    tools,
    toolsError,
    toolsPending,
}: {
    connection: McpConnection | null;
    onAddAccount: (connection: McpConnection) => void;
    onDelete: (connection: McpConnection) => void;
    onDisconnect: (connection: McpConnection) => void;
    onOpenChange: (open: boolean) => void;
    onRefresh: (connection: McpConnection) => Promise<void>;
    onStartOAuth: (connection: McpConnection) => void;
    onUpdateHeaders: (connection: McpConnection, headers: Record<string, string>) => Promise<void>;
    open: boolean;
    saving: boolean;
    startingOAuthId: string | null;
    tools: McpConnectionTool[] | null;
    toolsError: string | null;
    toolsPending: boolean;
}) {
    const [destructiveAction, setDestructiveAction] = useState<McpDestructiveAction | null>(null);
    const [editingHeaders, setEditingHeaders] = useState(false);
    const [pendingHeaders, setPendingHeaders] = useState<Record<string, string> | null>(null);
    if (!connection) {
        return null;
    }

    return (
        <>
            <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
                {/* A server can expose dozens of tools. `outside` — the
                    house default for bounded dialogs — would grow this one
                    without limit; `inside` caps the dialog and scrolls the
                    body, keeping the identity header and the actions
                    reachable at any tool count. */}
                <Modal.Container scroll="inside" size="lg">
                    <Modal.Dialog>
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Icon className="overflow-hidden bg-default text-foreground">
                                <ConnectionGlyph connection={connection} />
                            </Modal.Icon>
                            <Modal.Heading>{connection.name}</Modal.Heading>
                            {/* What the server is, when it says so. Its state
                                and its address are facts in the body, not part
                                of its identity. */}
                            <p className="mt-1.5 text-muted text-sm leading-5">
                                {connection.summary ?? 'MCP server connection.'}
                            </p>
                        </Modal.Header>
                        <Modal.Body>
                            {/* A column, not a grid: grid items refuse to
                                shrink below their min-content, so one long
                                server address would widen every group. */}
                            <div className="flex flex-col gap-6">
                                <McpConnectionFacts connection={connection} />
                                <McpToolsGroup
                                    connection={connection}
                                    error={toolsError}
                                    onRefresh={() => {
                                        void onRefresh(connection).catch(() => undefined);
                                    }}
                                    pending={toolsPending}
                                    tools={tools}
                                />
                                <McpAgentAccessGroup connection={connection} />
                                <McpManageGroup
                                    connection={connection}
                                    onAddAccount={() => onAddAccount(connection)}
                                    onDestructiveAction={setDestructiveAction}
                                    saving={saving}
                                />
                            </div>
                        </Modal.Body>
                        <Modal.Footer>
                            <Button slot="close" variant="secondary">
                                Done
                            </Button>
                            {connection.auth === 'oauth' ? (
                                <Button
                                    isDisabled={saving}
                                    isPending={startingOAuthId === connection.id}
                                    onPress={() => onStartOAuth(connection)}
                                >
                                    {connection.connected ? 'Sign in again' : 'Sign in'}
                                </Button>
                            ) : null}
                            {connection.auth === 'headers' ? (
                                <Button isDisabled={saving} onPress={() => setEditingHeaders(true)}>
                                    {connection.connected
                                        ? 'Replace credentials'
                                        : 'Add credentials'}
                                </Button>
                            ) : null}
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
            <ConnectionDestructiveDialog
                action={destructiveAction}
                connection={connection}
                onConfirm={() => {
                    if (destructiveAction === 'delete') {
                        onDelete(connection);
                    } else if (destructiveAction === 'disconnect') {
                        onDisconnect(connection);
                    } else if (destructiveAction === 'replace-credentials' && pendingHeaders) {
                        void onUpdateHeaders(connection, pendingHeaders).catch(() => undefined);
                    }
                    setPendingHeaders(null);
                    setDestructiveAction(null);
                }}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        setDestructiveAction(null);
                    }
                }}
            />
            <McpHeaderCredentialsDialog
                connection={connection}
                onOpenChange={setEditingHeaders}
                onSave={async (headers) => {
                    if (connection.affectedAgents.length > 0) {
                        setPendingHeaders(headers);
                        setEditingHeaders(false);
                        setDestructiveAction('replace-credentials');
                        return;
                    }
                    await onUpdateHeaders(connection, headers);
                    setEditingHeaders(false);
                }}
                open={editingHeaders}
                saving={saving}
            />
        </>
    );
}
