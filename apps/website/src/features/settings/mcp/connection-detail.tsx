import { isMcpBearerTokenPreset } from '@haus/api';
import { Alert, toast } from '@heroui/react';
import * as React from 'react';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useConnectionDelete } from '../../../hooks/servers/use-connection-delete.ts';
import { useConnectionDisconnect } from '../../../hooks/servers/use-connection-disconnect.ts';
import { useConnectionHeadersUpdate } from '../../../hooks/servers/use-connection-headers-update.ts';
import { useConnectionOauthStart } from '../../../hooks/servers/use-connection-oauth-start.ts';
import { useConnectionPresetAdd } from '../../../hooks/servers/use-connection-preset-add.ts';
import { useConnectionRefresh } from '../../../hooks/servers/use-connection-refresh.ts';
import { useConnectionTokenUpdate } from '../../../hooks/servers/use-connection-token-update.ts';
import { useConnections } from '../../../hooks/servers/use-connections.ts';
import { getHausServerOrigin } from '../../../lib/haus-server.tsx';
import { ConnectionTrustDialog, toConnectionView } from './connection-view.tsx';
import { McpConnectionDetailDialog } from './mcp-connection-detail-dialog.tsx';
import type { McpConnection } from './mcp-server-shared.ts';

export function ConnectionDetail({
    connectionId,
    onClose,
    serverId,
}: {
    connectionId: string;
    onClose: () => void;
    serverId: string;
}) {
    const connections = useConnections(serverId);
    const agents = useAgents(serverId);
    const addPreset = useConnectionPresetAdd(serverId);
    const deleteConnection = useConnectionDelete(serverId);
    const disconnect = useConnectionDisconnect(serverId);
    const refresh = useConnectionRefresh(serverId);
    const replaceHeaders = useConnectionHeadersUpdate(serverId);
    const replaceToken = useConnectionTokenUpdate(serverId);
    const startOAuth = useConnectionOauthStart();
    const [connectingId, setConnectingId] = React.useState<string | null>(null);
    const [retryMessage, setRetryMessage] = React.useState<string | null>(null);
    const [trustRequest, setTrustRequest] = React.useState<{
        connection: McpConnection;
        origin: string;
    } | null>(null);
    const serverConnection = connections.data?.find((connection) => connection.id === connectionId);
    const connection = serverConnection
        ? toConnectionView(serverConnection, agents.data ?? [])
        : null;

    React.useEffect(() => {
        if (
            connectingId &&
            connections.data?.some((item) => item.id === connectingId && item.connected)
        ) {
            setConnectingId(null);
        }
    }, [connectingId, connections.data]);

    if (!connection) {
        return null;
    }

    const beginOAuth = async (target: McpConnection, allowAuthorizationServerOrigin = false) => {
        setRetryMessage(null);
        const popup = window.open('about:blank', '_blank');
        if (popup) {
            popup.opener = null;
        }
        try {
            const result = await startOAuth.mutateAsync({
                allowAuthorizationServerOrigin,
                connectionId: target.id,
                redirectUrl: new URL('/mcp/oauth/callback', getHausServerOrigin()).toString(),
                serverId,
            });
            if (result.status === 'trust-required') {
                popup?.close();
                setTrustRequest({
                    connection: target,
                    origin: result.authorizationServerOrigin,
                });
                return;
            }
            setConnectingId(target.id);
            if (popup) {
                popup.location.href = result.authorizationUrl;
            } else {
                window.open(result.authorizationUrl, '_blank', 'noopener,noreferrer');
            }
        } catch (cause) {
            popup?.close();
            const message = cause instanceof Error ? cause.message : 'Try again.';
            setRetryMessage(message);
            toast.danger('Connection failed', { description: message });
        }
    };

    return (
        <>
            {retryMessage ? (
                <Alert status="danger">
                    <Alert.Content>
                        <Alert.Title>Connection Failed</Alert.Title>
                        <Alert.Description>{retryMessage}</Alert.Description>
                    </Alert.Content>
                </Alert>
            ) : null}
            <McpConnectionDetailDialog
                connection={connection}
                onAddAccount={(target) => {
                    if (target.preset && !isMcpBearerTokenPreset(target.preset)) {
                        addPreset.mutate({
                            name: `${target.name} account`,
                            preset: target.preset,
                            serverId,
                        });
                    }
                }}
                onAddTokenAccount={async (target, bearerToken) => {
                    if (isMcpBearerTokenPreset(target.preset)) {
                        await addPreset.mutateAsync({
                            bearerToken,
                            name: `${target.name} account`,
                            preset: target.preset,
                            serverId,
                        });
                    }
                }}
                onDelete={(target) =>
                    deleteConnection.mutate({ connectionId: target.id, serverId })
                }
                onDisconnect={(target) => disconnect.mutate({ connectionId: target.id, serverId })}
                onOpenChange={(open) => !open && onClose()}
                onRefresh={(target) =>
                    refresh.mutateAsync({ connectionId: target.id, serverId }).then(() => undefined)
                }
                onReplaceToken={(target, bearerToken) =>
                    replaceToken
                        .mutateAsync({ bearerToken, connectionId: target.id, serverId })
                        .then(() => undefined)
                }
                onStartOAuth={(target) => void beginOAuth(target)}
                onUpdateHeaders={(target, headers) =>
                    replaceHeaders
                        .mutateAsync({ connectionId: target.id, headers, serverId })
                        .then(() => undefined)
                }
                open
                saving={addPreset.isPending || startOAuth.isPending}
                startingOAuthId={
                    startOAuth.isPending ? (startOAuth.variables?.connectionId ?? null) : null
                }
                tools={(serverConnection?.tools ?? []).map((name) => ({
                    description: '',
                    name,
                    title: null,
                }))}
                toolsError={null}
                toolsPending={connectingId === connectionId}
            />
            <ConnectionTrustDialog
                onClose={() => setTrustRequest(null)}
                onConfirm={() => {
                    if (trustRequest) {
                        void beginOAuth(trustRequest.connection, true);
                    }
                }}
                request={trustRequest}
            />
        </>
    );
}
