import { toast } from '@heroui/react';
import * as React from 'react';
import { useConnectionOauthStart } from '../../../hooks/servers/use-connection-oauth-start.ts';
import { getHausServerOrigin } from '../../../lib/haus-server.tsx';
import { type McpConnection, mcpOAuthRedirectUrl } from './mcp-server-shared.ts';

export interface ConnectionTrustRequest {
    connection: McpConnection;
    origin: string;
}

/**
 * The OAuth sign-in flow for one connection: open the provider in a new tab,
 * ask the reader to trust an unfamiliar authorization server first, and treat
 * the connection as connecting until Haus Server reports it connected.
 *
 * The popup is opened synchronously inside the press so browsers do not block
 * it, then pointed at the authorization URL once the Server answers.
 */
export function useConnectionSignIn({
    connected,
    serverId,
}: {
    /** Whether the connection being signed in is already connected. */
    connected: boolean;
    serverId: string;
}) {
    const startOAuth = useConnectionOauthStart();
    const [connectingId, setConnectingId] = React.useState<string | null>(null);
    const [retryMessage, setRetryMessage] = React.useState<string | null>(null);
    const [trustRequest, setTrustRequest] = React.useState<ConnectionTrustRequest | null>(null);
    // A finished sign-in ends the connecting state once the Server reports it.
    // Adjusted during render, so a later disconnect cannot revive the spinner.
    if (connectingId !== null && connected) {
        setConnectingId(null);
    }
    const connecting = connectingId !== null;

    const begin = async (target: McpConnection, allowAuthorizationServerOrigin = false) => {
        setRetryMessage(null);
        const popup = window.open('about:blank', '_blank');
        if (popup) {
            popup.opener = null;
        }
        try {
            const result = await startOAuth.mutateAsync({
                allowAuthorizationServerOrigin,
                connectionId: target.id,
                redirectUrl: mcpOAuthRedirectUrl(getHausServerOrigin()),
                serverId,
            });
            if (result.status === 'trust-required') {
                popup?.close();
                setTrustRequest({ connection: target, origin: result.authorizationServerOrigin });
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

    return {
        begin: (target: McpConnection) => void begin(target),
        confirmTrust: () => {
            if (trustRequest) {
                void begin(trustRequest.connection, true);
            }
        },
        connecting,
        dismissTrust: () => setTrustRequest(null),
        retryMessage,
        starting: startOAuth.isPending,
        trustRequest,
    };
}
