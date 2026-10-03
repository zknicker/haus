import { randomBytes } from 'node:crypto';
import type { McpOAuthStartResult } from '@haus/api';
import { eq } from 'drizzle-orm';
import { emitServerUpdated } from '../haus-api/server-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpConnectionsTable } from '../postgres/schema.ts';
import { completeMcpAuthorization, startMcpAuthorization } from './oauth.ts';
import type { McpRuntime } from './runtime.ts';

interface OAuthAttempt {
    connectionId: string;
    expiresAt: number;
    redirectUrl: string;
}

export type McpOAuthCallbackResult =
    | { status: 'complete' }
    | { status: 'expired' }
    | { status: 'failed' };

/** Server-local OAuth state. Callback codes and credentials never leave Server custody. */
export class McpOAuthRelay {
    private readonly attempts = new Map<string, OAuthAttempt>();

    constructor(
        private readonly db: HausDatabase,
        private readonly runtime: McpRuntime,
        private readonly now: () => number = Date.now,
        private readonly ttlMs = 5 * 60_000
    ) {}

    async start(input: {
        allowAuthorizationServerOrigin: boolean;
        connectionId: string;
        redirectUrl: string;
    }): Promise<McpOAuthStartResult> {
        validateRedirectUrl(input.redirectUrl);
        this.removeExpired();
        const routingState = randomBytes(32).toString('base64url');
        this.attempts.set(routingState, {
            connectionId: input.connectionId,
            expiresAt: this.now() + this.ttlMs,
            redirectUrl: input.redirectUrl,
        });
        try {
            const result = await startMcpAuthorization(this.runtime, {
                ...input,
                routingState,
            });
            if (result.status !== 'ready') {
                this.attempts.delete(routingState);
            }
            return result;
        } catch (cause) {
            this.attempts.delete(routingState);
            throw cause;
        }
    }

    async complete(state: string, code: string): Promise<McpOAuthCallbackResult> {
        const attempt = this.attempts.get(state);
        this.attempts.delete(state);
        if (!attempt || attempt.expiresAt <= this.now()) {
            return { status: 'expired' };
        }
        try {
            await completeMcpAuthorization(this.runtime, {
                code,
                connectionId: attempt.connectionId,
                redirectUrl: attempt.redirectUrl,
                state,
            });
            await this.runtime.closeConnection(attempt.connectionId);
            const { preset } = await this.runtime.readConnection(attempt.connectionId);
            const discovery = await this.runtime.discover(attempt.connectionId, preset);
            const [updated] = await this.db
                .update(mcpConnectionsTable)
                .set({
                    accountLabel: discovery.accountLabel,
                    connected: true,
                    tools: [...new Set(discovery.tools)].sort(),
                })
                .where(eq(mcpConnectionsTable.id, attempt.connectionId))
                .returning({ serverId: mcpConnectionsTable.serverId });
            if (updated) {
                emitServerUpdated({ scope: 'mcp', serverId: updated.serverId });
            }
            return { status: 'complete' };
        } catch (error) {
            console.error(
                `[haus] MCP OAuth callback failed for connection ${attempt.connectionId}`,
                error
            );
            return { status: 'failed' };
        }
    }

    private removeExpired(): void {
        const now = this.now();
        for (const [state, attempt] of this.attempts) {
            if (attempt.expiresAt <= now) {
                this.attempts.delete(state);
            }
        }
    }
}

function validateRedirectUrl(value: string): void {
    const url = new URL(value);
    const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
    if (
        url.pathname !== '/mcp/oauth/callback' ||
        url.search ||
        url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    ) {
        throw new Error('The MCP OAuth callback URL is invalid.');
    }
}
