import type { McpOAuthStartResult } from '@haus/api';
import type { McpConnection } from './mcp-server-shared.ts';

/** The tab a sign-in drives: opened blank in the press, pointed at the provider later. */
export interface SignInPopup {
    close: () => void;
    location: { href: string };
}

/** What a sign-in needs from the page: the popup, the Server, and where each outcome lands. */
export interface SignInFlow {
    onAuthorizing: (connection: McpConnection) => void;
    onFailed: (message: string) => void;
    onTrustRequired: (connection: McpConnection, origin: string) => void;
    /** Opens a blank tab. Must run synchronously inside the press, or browsers block it. */
    openPopup: () => SignInPopup | null;
    /** The fallback when the browser blocked the blank tab. */
    openUrl: (url: string) => void;
    startOAuth: (
        connectionId: string,
        allowAuthorizationServerOrigin: boolean
    ) => Promise<McpOAuthStartResult>;
}

/**
 * Signs in to an existing connection. Opens the tab before anything awaits,
 * then points it at the provider once the Server answers.
 */
export function signIn(
    flow: SignInFlow,
    connection: McpConnection,
    allowAuthorizationServerOrigin = false
): Promise<void> {
    const popup = flow.openPopup();
    return authorize(flow, popup, connection, allowAuthorizationServerOrigin);
}

/**
 * Creates a connection, then signs in to it, in one press. The tab opens
 * first — before the create awaits — so the browser still counts it as the
 * press's own; `onCreated` runs before sign-in starts, so the reader can be
 * on the new connection's page while the provider loads.
 */
export async function createAndSignIn(
    flow: SignInFlow,
    create: () => Promise<McpConnection>,
    onCreated: (connection: McpConnection) => void
): Promise<void> {
    const popup = flow.openPopup();
    let connection: McpConnection;
    try {
        connection = await create();
    } catch (cause) {
        popup?.close();
        flow.onFailed(failureMessage(cause));
        return;
    }
    onCreated(connection);
    await authorize(flow, popup, connection, false);
}

async function authorize(
    flow: SignInFlow,
    popup: SignInPopup | null,
    connection: McpConnection,
    allowAuthorizationServerOrigin: boolean
): Promise<void> {
    try {
        const result = await flow.startOAuth(connection.id, allowAuthorizationServerOrigin);
        if (result.status === 'trust-required') {
            popup?.close();
            flow.onTrustRequired(connection, result.authorizationServerOrigin);
            return;
        }
        flow.onAuthorizing(connection);
        if (popup) {
            popup.location.href = result.authorizationUrl;
        } else {
            flow.openUrl(result.authorizationUrl);
        }
    } catch (cause) {
        popup?.close();
        flow.onFailed(failureMessage(cause));
    }
}

function failureMessage(cause: unknown): string {
    return cause instanceof Error ? cause.message : 'Try again.';
}
