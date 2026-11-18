import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpConnectionsTable, mcpSecretsTable } from '../postgres/schema.ts';
import {
    configuredOAuthClient,
    configuredOAuthClientInformation,
} from '../server-mcp/oauth-clients.ts';
import { GithubApiError, type GithubApiTransport } from './github-api.ts';
import { GithubAppUnavailableError, GithubSignInRequiredError } from './github-errors.ts';

// The connection's GitHub App user token (`ghu_`, 8 hours) and its refresh
// token (`ghr_`, 6 months) live in `mcp_secrets` beside the hosted MCP's OAuth
// state, written by the same sign-in. Server-side GitHub reads (owner checks,
// repository access, pickers) use the access token and refresh it once when
// GitHub answers 401. The MCP OAuth provider re-reads the stored tokens per
// request, so a refresh here reaches live MCP clients too.

const githubTokenUrl = 'https://github.com/login/oauth/access_token';

export interface GithubUserTokenDependencies {
    db: HausDatabase;
    transport?: GithubApiTransport;
}

interface StoredTokens {
    access_token?: unknown;
    refresh_token?: unknown;
    [key: string]: unknown;
}

/**
 * Runs `use` with the connection's user access token. A 401 refreshes the
 * token once and retries; a connection that is not connected, has no token,
 * or whose refresh GitHub rejects is `GithubSignInRequiredError`.
 */
export async function withGithubUserToken<T>(
    dependencies: GithubUserTokenDependencies,
    connection: { connectionId: string; serverId: string },
    use: (token: string) => Promise<T>
): Promise<T> {
    const token = await readAccessToken(dependencies.db, connection);
    try {
        return await use(token);
    } catch (cause) {
        if (!(cause instanceof GithubApiError && cause.status === 401)) {
            throw cause;
        }
    }
    return await use(await refreshGithubUserToken(dependencies, connection, token));
}

/** One refresh in flight per connection in this process; concurrent callers share it. */
const refreshesInFlight = new Map<string, Promise<string>>();

/**
 * Exchanges the stored refresh token for a new pair and stores it, keeping the
 * authorization-server facts the MCP client recorded on the token. GitHub
 * refresh tokens are single use, so concurrent callers in this process share
 * one exchange, and the write only lands while the stored pair is still the one
 * that was refreshed. When another path (the MCP OAuth provider) rotated the
 * pair first, its stored newer token wins.
 */
export async function refreshGithubUserToken(
    dependencies: GithubUserTokenDependencies,
    connection: { connectionId: string; serverId: string },
    staleAccessToken: string
): Promise<string> {
    const running = refreshesInFlight.get(connection.connectionId);
    if (running) {
        return await running;
    }
    const refresh = exchangeRefreshToken(dependencies, connection, staleAccessToken).finally(() => {
        refreshesInFlight.delete(connection.connectionId);
    });
    refreshesInFlight.set(connection.connectionId, refresh);
    return await refresh;
}

async function exchangeRefreshToken(
    dependencies: GithubUserTokenDependencies,
    connection: { connectionId: string; serverId: string },
    staleAccessToken: string
): Promise<string> {
    const stored = await readStoredTokens(dependencies.db, connection);
    if (typeof stored.access_token === 'string' && stored.access_token !== staleAccessToken) {
        return stored.access_token;
    }
    if (typeof stored.refresh_token !== 'string') {
        throw new GithubSignInRequiredError();
    }
    const answer = await requestRefresh(dependencies.transport, stored.refresh_token);
    if (typeof answer.access_token !== 'string') {
        const latest = await readStoredTokens(dependencies.db, connection);
        if (typeof latest.access_token === 'string' && latest.access_token !== staleAccessToken) {
            return latest.access_token;
        }
        throw new GithubSignInRequiredError();
    }
    return await writeTokensIfUnchanged(dependencies.db, connection.connectionId, {
        accessToken: answer.access_token,
        next: { ...stored, ...answer },
        refreshed: stored.refresh_token,
    });
}

async function requestRefresh(
    transport: GithubApiTransport | undefined,
    refreshToken: string
): Promise<StoredTokens> {
    const client = configuredOAuthClient('github');
    if (!client) {
        throw new GithubAppUnavailableError();
    }
    let information: { client_id: string; client_secret?: string };
    try {
        information = configuredOAuthClientInformation(client);
    } catch {
        throw new GithubAppUnavailableError();
    }
    let response: Response;
    try {
        response = await (transport?.fetch ?? fetch)(githubTokenUrl, {
            body: new URLSearchParams({
                client_id: information.client_id,
                client_secret: information.client_secret ?? '',
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }),
            headers: {
                accept: 'application/json',
                'content-type': 'application/x-www-form-urlencoded',
            },
            method: 'POST',
        });
    } catch (cause) {
        throw new GithubApiError(
            'retryable',
            null,
            `GitHub token refresh failed: ${String(cause)}`
        );
    }
    if (response.status === 429 || response.status >= 500) {
        throw new GithubApiError('retryable', response.status, 'GitHub token refresh failed.');
    }
    if (!response.ok) {
        return {};
    }
    // GitHub answers a rejected refresh with 200 and `{ error }`.
    const body = (await response.json()) as StoredTokens;
    return typeof body.access_token === 'string' ? withoutUndefined(body) : {};
}

async function readAccessToken(
    db: HausDatabase,
    connection: { connectionId: string; serverId: string }
): Promise<string> {
    const tokens = await readStoredTokens(db, connection);
    if (typeof tokens.access_token !== 'string') {
        throw new GithubSignInRequiredError();
    }
    return tokens.access_token;
}

async function readStoredTokens(
    db: HausDatabase,
    connection: { connectionId: string; serverId: string }
): Promise<StoredTokens> {
    const [row] = await db
        .select({ connected: mcpConnectionsTable.connected, secret: mcpSecretsTable.secret })
        .from(mcpConnectionsTable)
        .leftJoin(mcpSecretsTable, eq(mcpSecretsTable.connectionId, mcpConnectionsTable.id))
        .where(
            and(
                eq(mcpConnectionsTable.serverId, connection.serverId),
                eq(mcpConnectionsTable.id, connection.connectionId),
                eq(mcpConnectionsTable.preset, 'github')
            )
        )
        .limit(1);
    if (!row?.connected) {
        throw new GithubSignInRequiredError();
    }
    const tokens = (row.secret as { tokens?: unknown } | null)?.tokens;
    return tokens && typeof tokens === 'object' ? (tokens as StoredTokens) : {};
}

/**
 * Stores `next` under the secret-row lock only while the stored refresh token
 * is still `refreshed`; otherwise another path rotated first and its stored
 * access token is answered instead. Returns the access token now current.
 */
async function writeTokensIfUnchanged(
    db: HausDatabase,
    connectionId: string,
    input: { accessToken: string; next: StoredTokens; refreshed: string }
): Promise<string> {
    return await db.transaction(async (tx) => {
        const [row] = await tx
            .select({ secret: mcpSecretsTable.secret })
            .from(mcpSecretsTable)
            .where(eq(mcpSecretsTable.connectionId, connectionId))
            .for('update');
        if (!row) {
            throw new GithubSignInRequiredError();
        }
        const current = (row.secret as { tokens?: StoredTokens }).tokens;
        if (current?.refresh_token !== input.refreshed) {
            if (typeof current?.access_token !== 'string') {
                throw new GithubSignInRequiredError();
            }
            return current.access_token;
        }
        await tx
            .update(mcpSecretsTable)
            .set({ secret: { ...row.secret, tokens: input.next }, updatedAt: new Date() })
            .where(eq(mcpSecretsTable.connectionId, connectionId));
        return input.accessToken;
    });
}

function withoutUndefined(value: StoredTokens): StoredTokens {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
