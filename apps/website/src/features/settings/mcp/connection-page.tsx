import { Alert } from '@heroui/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useConnection } from '../../../hooks/servers/use-connection.ts';
import { useConnectionDelete } from '../../../hooks/servers/use-connection-delete.ts';
import { useConnectionDisconnect } from '../../../hooks/servers/use-connection-disconnect.ts';
import { useConnectionRefresh } from '../../../hooks/servers/use-connection-refresh.ts';
import { useSkoolConnect } from '../../../hooks/servers/use-skool-connect.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { settingsConnectionRoute } from '../../servers/server-routes.ts';
import { PageColumn } from '../../shell/page-column.tsx';
import { ConnectionDetailHeader } from './connection-detail-header.tsx';
import { ConnectionTrustDialog, toConnectionView } from './connection-view.tsx';
import { McpBearerTokenDialog } from './mcp-bearer-token-dialog.tsx';
import { McpAccountSection } from './mcp-connection-account.tsx';
import {
    ConnectionDestructiveDialog,
    type McpDestructiveAction,
} from './mcp-connection-actions.tsx';
import { McpAgentAccessSection } from './mcp-connection-agents.tsx';
import { McpConnectionFacts } from './mcp-connection-facts.tsx';
import { McpToolsSection } from './mcp-connection-tools.tsx';
import { McpHeaderCredentialsDialog } from './mcp-header-credentials-dialog.tsx';
import { SkoolConnectDialog } from './skool-connect-dialog.tsx';
import type { CredentialsEditor } from './use-connection-credentials.ts';
import { useConnectionCredentials } from './use-connection-credentials.ts';
import type { ConnectionSignIn } from './use-connection-sign-in.ts';

/**
 * One connection's settings page, read like a product page: identity and setup
 * action, the account it signs in as, which Agents may use it, then reference
 * material — what it exposes and the facts the Server keeps. Confirmations and
 * the credentials form stay dialogs over the page.
 *
 * Blank until the connection list has loaded; the route sends a removed or
 * unknown connection back to the list. Sign-in comes from the route, so one
 * that starts here can finish on another connection's page.
 */
export function ConnectionPage({
    connectionId,
    serverId,
    signIn,
}: {
    connectionId: string;
    serverId: string;
    signIn: ConnectionSignIn;
}) {
    const record = useConnection(serverId, connectionId).data;
    const agents = useAgents(serverId);
    const deleteConnection = useConnectionDelete(serverId);
    const disconnect = useConnectionDisconnect(serverId);
    const refresh = useConnectionRefresh(serverId);
    const skool = useSkoolConnect(serverId);
    const navigate = useNavigate();
    const { slug } = useServerContext().server;
    const [destructiveAction, setDestructiveAction] = useState<McpDestructiveAction | null>(null);
    const view = record ? toConnectionView(record, agents.data ?? []) : null;
    const credentials = useConnectionCredentials({
        connection: view,
        onAccountCreated: (created) => navigate(settingsConnectionRoute(slug, created.id)),
        requestConfirmation: () => setDestructiveAction('replace-credentials'),
        serverId,
        signIn,
    });

    if (!(record && view)) {
        return null;
    }

    const connection = view;
    const { tokenPreset } = credentials;
    const saving = credentials.saving || signIn.starting || skool.connecting;
    const skoolEditor = resolveSkoolEditor(credentials.editor);

    return (
        <PageColumn>
            {/* A product page reads at a measure, not across the full
                settings column; the page still scrolls with the frame. */}
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
                <ConnectionDetailHeader
                    connection={connection}
                    onAddCredentials={credentials.editCredentials}
                    onRefresh={() => refresh.mutate({ connectionId, serverId })}
                    onRemove={() => setDestructiveAction('delete')}
                    onSignIn={() => signIn.begin(connection)}
                    saving={saving}
                    signingIn={signIn.starting}
                    usesToken={tokenPreset !== null}
                />
                {signIn.retryMessage ? (
                    <Alert status="danger">
                        <Alert.Content>
                            <Alert.Title>Connection Failed</Alert.Title>
                            <Alert.Description>{signIn.retryMessage}</Alert.Description>
                        </Alert.Content>
                    </Alert>
                ) : null}
                <McpAccountSection
                    connection={connection}
                    onAddAccount={credentials.addAccount}
                    onDisconnect={() => setDestructiveAction('disconnect')}
                    onReauthorize={() =>
                        connection.auth === 'oauth'
                            ? signIn.begin(connection)
                            : credentials.editCredentials()
                    }
                    saving={saving}
                    usesToken={tokenPreset !== null}
                />
                <McpAgentAccessSection connection={connection} serverId={serverId} />
                <McpToolsSection
                    connection={connection}
                    pending={signIn.connecting || refresh.isPending}
                    tools={record.tools}
                />
                <McpConnectionFacts connection={connection} usesToken={tokenPreset !== null} />
            </div>
            <ConnectionDestructiveDialog
                action={destructiveAction}
                connection={connection}
                onConfirm={() => {
                    if (destructiveAction === 'delete') {
                        deleteConnection.mutate({ connectionId, serverId });
                    } else if (destructiveAction === 'disconnect') {
                        disconnect.mutate({ connectionId, serverId });
                    } else if (destructiveAction === 'replace-credentials') {
                        credentials.confirmPending();
                    }
                    setDestructiveAction(null);
                }}
                onOpenChange={(open) => {
                    if (!open) {
                        setDestructiveAction(null);
                    }
                }}
            />
            <McpHeaderCredentialsDialog
                connection={connection}
                onOpenChange={(open) => !open && credentials.closeEditor()}
                onSave={credentials.saveHeaders}
                open={credentials.editor === 'headers'}
                saving={saving}
            />
            {skoolEditor ? (
                <SkoolConnectDialog
                    affectedAgentCount={
                        skoolEditor === 'skool' ? connection.affectedAgents.length : 0
                    }
                    onClose={credentials.closeEditor}
                    onConnect={() => {
                        const target = skoolEditor === 'account-skool' ? undefined : connectionId;
                        credentials.closeEditor();
                        void skool.connect(target).then((created) => {
                            if (created) {
                                navigate(settingsConnectionRoute(slug, created.id));
                            }
                        });
                    }}
                />
            ) : tokenPreset ? (
                <McpBearerTokenDialog
                    heading={
                        credentials.editor === 'account-token'
                            ? `Add another ${connection.name} account`
                            : `${connection.connected ? 'Replace' : 'Add'} ${connection.name} token`
                    }
                    onOpenChange={(open) => !open && credentials.closeEditor()}
                    onSave={credentials.saveToken}
                    open={credentials.editor === 'account-token' || credentials.editor === 'token'}
                    preset={tokenPreset}
                />
            ) : null}
            <ConnectionTrustDialog
                onClose={signIn.dismissTrust}
                onConfirm={signIn.confirmTrust}
                request={signIn.trustRequest}
            />
        </PageColumn>
    );
}

function resolveSkoolEditor(editor: CredentialsEditor | null) {
    return editor === 'account-skool' || editor === 'skool' ? editor : null;
}
