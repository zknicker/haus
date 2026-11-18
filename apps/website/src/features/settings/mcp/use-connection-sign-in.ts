import { toast } from '@heroui/react';
import * as React from 'react';
import { useConnectionOauthStart } from '../../../hooks/servers/use-connection-oauth-start.ts';
import { getHausServerOrigin } from '../../../lib/haus-server.tsx';
import { createAndSignIn, type SignInFlow, signIn } from './connection-sign-in-flow.ts';
import { type McpConnection, mcpOAuthRedirectUrl } from './mcp-server-shared.ts';

export interface ConnectionTrustRequest {
    connection: McpConnection;
    origin: string;
}

/**
 * The OAuth sign-in flow for the connection page: open the provider in a new
 * tab, ask the reader to trust an unfamiliar authorization server first, and
 * treat the connection as connecting until Haus Server reports it connected.
 *
 * Owned by the route rather than the page, which remounts per connection, so
 * adding another account can create a connection, move to its page, and keep
 * signing in to it there. Connecting and failure states belong to the
 * connection they were started for.
 */
export function useConnectionSignIn({
    connected,
    connectionId,
    serverId,
}: {
    /** Whether the shown connection is already connected. */
    connected: boolean;
    /** The connection the page is showing. */
    connectionId: string;
    serverId: string;
}) {
    const startOAuth = useConnectionOauthStart();
    const [connectingId, setConnectingId] = React.useState<string | null>(null);
    const [failure, setFailure] = React.useState<{ connectionId: string; message: string } | null>(
        null
    );
    const [trustRequest, setTrustRequest] = React.useState<ConnectionTrustRequest | null>(null);
    const [creating, setCreating] = React.useState(false);
    // A second press while one create is in flight would add a second account.
    const creatingRef = React.useRef(false);
    // A finished sign-in ends the connecting state once the Server reports it.
    // Adjusted during render, so a later disconnect cannot revive the spinner.
    if (connectingId === connectionId && connected) {
        setConnectingId(null);
    }

    const flowFor = (targetId: () => string | null): SignInFlow => ({
        onAuthorizing: (connection) => setConnectingId(connection.id),
        onFailed: (message) => {
            const id = targetId();
            if (id) {
                setFailure({ connectionId: id, message });
            }
            toast.danger('Connection failed', { description: message });
        },
        onTrustRequired: (connection, origin) => setTrustRequest({ connection, origin }),
        openPopup: () => {
            const popup = window.open('about:blank', '_blank');
            if (popup) {
                popup.opener = null;
            }
            return popup;
        },
        openUrl: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
        startOAuth: (id, allowAuthorizationServerOrigin) =>
            startOAuth.mutateAsync({
                allowAuthorizationServerOrigin,
                connectionId: id,
                redirectUrl: mcpOAuthRedirectUrl(getHausServerOrigin()),
                serverId,
            }),
    });

    const begin = (target: McpConnection, allowAuthorizationServerOrigin = false) => {
        setFailure(null);
        void signIn(
            flowFor(() => target.id),
            target,
            allowAuthorizationServerOrigin
        );
    };

    return {
        begin: (target: McpConnection) => begin(target),
        /**
         * Creates a connection and signs in to it from one press. `onCreated`
         * runs once the Server has the connection, before the provider opens.
         */
        beginCreated: (
            create: () => Promise<McpConnection>,
            onCreated: (connection: McpConnection) => void
        ) => {
            if (creatingRef.current) {
                return;
            }
            creatingRef.current = true;
            setCreating(true);
            setFailure(null);
            let createdId: string | null = null;
            const flow = flowFor(() => createdId ?? connectionId);
            void createAndSignIn(flow, create, (connection) => {
                createdId = connection.id;
                onCreated(connection);
            }).finally(() => {
                creatingRef.current = false;
                setCreating(false);
            });
        },
        confirmTrust: () => {
            if (trustRequest) {
                begin(trustRequest.connection, true);
            }
        },
        connecting: connectingId === connectionId,
        dismissTrust: () => setTrustRequest(null),
        retryMessage: failure?.connectionId === connectionId ? failure.message : null,
        starting: creating || startOAuth.isPending,
        trustRequest,
    };
}

export type ConnectionSignIn = ReturnType<typeof useConnectionSignIn>;
