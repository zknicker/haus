import { and, eq, ne, sql } from 'drizzle-orm';
import * as z from 'zod';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubInstallationsTable } from '../postgres/schema.ts';
import { GithubApiError, githubRequest } from './github-api.ts';
import type { GithubApp } from './github-app.ts';

/** GitHub issues installation tokens for an hour; replace one well before that. */
const tokenRefreshMarginMs = 5 * 60_000;

const installationTokenSchema = z.object({
    expires_at: z.iso.datetime(),
    token: z.string().min(1),
});

const toolCallSchema = z.object({
    method: z.literal('tools/call'),
    params: z.object({ arguments: z.object({ owner: z.string().min(1) }) }),
});

type McpFetch = (url: string | URL, init?: RequestInit) => Promise<Response>;

/** Finds the bound installation for a GitHub account on one connection. */
export type GithubInstallationLookup = (
    connectionId: string,
    owner: string
) => Promise<number | null>;

/** Sends a connection's Agent tool calls as the Haus GitHub App. */
export interface GithubBot {
    fetch(connectionId: string, next: McpFetch): McpFetch;
}

/**
 * A tool call naming an `owner` with a bound installation runs as the App, so
 * GitHub attributes it to the bot. Every other request keeps the connection's
 * user token. A call with an installation never falls back to the user token:
 * a failed mint fails the call rather than posting under a person's name.
 */
export function createGithubBot(
    app: GithubApp,
    findInstallation: GithubInstallationLookup,
    now: () => number = Date.now
): GithubBot {
    const tokens = createInstallationTokens(app, now);
    return {
        fetch: (connectionId, next) => async (url, init) => {
            const owner = toolCallOwner(init?.body);
            const installationId = owner ? await findInstallation(connectionId, owner) : null;
            if (installationId === null) {
                return await next(url, init);
            }
            const send = async () => {
                const headers = new Headers(init?.headers);
                headers.set('Authorization', `Bearer ${await tokens.read(installationId)}`);
                return await next(url, { ...init, headers });
            };
            const response = await send();
            if (response.status !== 401) {
                return response;
            }
            tokens.forget(installationId);
            return await send();
        },
    };
}

/** The live installation bound to a connection for a GitHub account, by login. */
export function githubInstallationLookup(db: HausDatabase): GithubInstallationLookup {
    return async (connectionId, owner) => {
        const [row] = await db
            .select({ installationId: githubInstallationsTable.installationId })
            .from(githubInstallationsTable)
            .where(
                and(
                    eq(githubInstallationsTable.connectionId, connectionId),
                    ne(githubInstallationsTable.status, 'removed'),
                    eq(sql`lower(${githubInstallationsTable.accountLogin})`, owner.toLowerCase())
                )
            )
            .limit(1);
        return row?.installationId ?? null;
    };
}

/** Mints and caches each installation's token, replacing it well before it expires. */
export function createInstallationTokens(app: GithubApp, now: () => number = Date.now) {
    const cached = new Map<number, { expiresAt: number; token: string }>();
    const minting = new Map<number, Promise<string>>();

    const mint = async (installationId: number) => {
        const { body } = await githubRequest(
            {
                credential: { jwt: await app.signer.jwt(), kind: 'app' },
                method: 'POST',
                path: `/app/installations/${installationId}/access_tokens`,
            },
            app.transport
        );
        const { expiresAt, token } = readInstallationToken(body);
        cached.set(installationId, { expiresAt, token });
        return token;
    };

    return {
        forget(installationId: number) {
            cached.delete(installationId);
        },
        read(installationId: number): Promise<string> {
            const held = cached.get(installationId);
            if (held && held.expiresAt - tokenRefreshMarginMs > now()) {
                return Promise.resolve(held.token);
            }
            const pending = minting.get(installationId);
            if (pending) {
                return pending;
            }
            const started = mint(installationId).finally(() => minting.delete(installationId));
            minting.set(installationId, started);
            return started;
        },
    };
}

function readInstallationToken(body: unknown): { expiresAt: number; token: string } {
    const parsed = installationTokenSchema.safeParse(body);
    if (!parsed.success) {
        throw new GithubApiError(
            'retryable',
            null,
            'GitHub sent an unreadable installation token.'
        );
    }
    return { expiresAt: Date.parse(parsed.data.expires_at), token: parsed.data.token };
}

/** The `owner` argument of a JSON-RPC `tools/call` body, if the request is one. */
function toolCallOwner(body: RequestInit['body']): string | null {
    if (typeof body !== 'string') {
        return null;
    }
    try {
        const parsed = toolCallSchema.safeParse(JSON.parse(body));
        return parsed.success ? parsed.data.params.arguments.owner : null;
    } catch {
        return null;
    }
}
