import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import * as z from 'zod';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearIdentitiesTable, serversTable } from '../postgres/schema.ts';
import { linearUpdatedTopic } from '../realtime/topics.ts';
import type { McpRuntime } from '../server-mcp/runtime.ts';
import { bindLinearInstall } from './binding.ts';
import {
    exchangeLinearCode,
    LinearApiError,
    type LinearApp,
    type LinearTokenPair,
    revokeLinearToken,
} from './linear-api.ts';
import { LinearRefusedError } from './linear-errors.ts';
import { readLinearInstallFacts } from './linear-install-reads.ts';
import { consumeLinearAttempt, type LinearAttempt } from './oauth-attempts.ts';

export const linearOauthCallbackPath = '/linear/oauth/callback';

export interface LinearCallbackDependencies {
    appOrigin: string;
    clock?: { now(): Date };
    db: HausDatabase;
    linearApp: LinearApp | null;
    mcpRuntime: Pick<McpRuntime, 'closeConnection' | 'inventory'>;
}

const querySchema = z.object({
    code: z.string().min(1).max(2000).optional(),
    error: z.string().max(200).optional(),
    state: z.string().min(1).max(200).optional(),
});

/** The redirect URI every install names; Linear requires it to match exactly. */
export function linearCallbackUrl(app: Pick<LinearApp, 'publicOrigin'>): string {
    return `${app.publicOrigin}${linearOauthCallbackPath}`;
}

/**
 * Every install's OAuth redirect (specs/linear-app.md#binding-and-authority).
 * The attempt is consumed exactly once, the code is exchanged with its PKCE
 * verifier, Linear facts are read with the new token, and only then does the
 * binding transaction run. The browser returns to the Linear page with
 * `?linear_setup=<outcome>`; a token that binds nothing is revoked.
 */
export function registerLinearOauthCallback(
    app: FastifyInstance,
    dependencies: LinearCallbackDependencies
) {
    const clock = dependencies.clock ?? { now: () => new Date() };
    app.get(linearOauthCallbackPath, async (request, reply) => {
        const { linearApp } = dependencies;
        if (!linearApp) {
            return page(reply, 503, 'Linear is unavailable', 'This Haus Server has no Linear app.');
        }
        const parsed = querySchema.safeParse(request.query);
        const query = parsed.success ? parsed.data : {};
        const attempt = query.state
            ? await consumeLinearAttempt(dependencies.db, query.state, clock.now())
            : null;
        if (!attempt) {
            return page(
                reply,
                400,
                'Install link expired',
                'Return to Haus and choose Connect Linear again.'
            );
        }
        const outcome = query.code
            ? await install({ ...dependencies, clock, linearApp }, attempt, query.code)
            : { connectionId: attempt.connectionId, outcome: 'linear_denied' };
        return reply.redirect(
            `${await linearPage(dependencies, attempt.serverId, outcome.connectionId)}?linear_setup=${outcome.outcome}`,
            302
        );
    });
}

async function install(
    dependencies: LinearCallbackDependencies & { clock: { now(): Date }; linearApp: LinearApp },
    attempt: LinearAttempt,
    code: string
): Promise<{ connectionId: string | null; outcome: string }> {
    const { db, linearApp } = dependencies;
    const clientId = await attemptClientId(db, linearApp, attempt);
    if (!clientId) {
        return { connectionId: attempt.connectionId, outcome: 'linear_identity_not_found' };
    }
    let tokens: LinearTokenPair | null = null;
    try {
        tokens = await exchangeLinearCode(linearApp.fetch, {
            clientId,
            code,
            codeVerifier: attempt.codeVerifier,
            now: dependencies.clock.now(),
            redirectUri: linearCallbackUrl(linearApp),
        });
        const facts = await readLinearInstallFacts(linearApp.fetch, tokens.accessToken);
        const bound = await bindLinearInstall(db, {
            attempt,
            facts,
            now: dependencies.clock.now(),
            tokens,
        });
        linearUpdatedTopic.announce({
            connectionId: bound.connectionId,
            serverId: attempt.serverId,
        });
        await refreshInventory(dependencies.mcpRuntime, bound.connectionId);
        return { connectionId: bound.connectionId, outcome: bound.kind };
    } catch (cause) {
        if (tokens) {
            await revokeUnbound(linearApp, clientId, tokens);
        }
        if (cause instanceof LinearRefusedError) {
            return { connectionId: attempt.connectionId, outcome: cause.reason };
        }
        if (cause instanceof LinearApiError) {
            return { connectionId: attempt.connectionId, outcome: 'linear_unavailable' };
        }
        throw cause;
    }
}

/** Workspace installs use the Haus app's client; identity installs use the identity's own app. */
async function attemptClientId(db: HausDatabase, app: LinearApp, attempt: LinearAttempt) {
    if (attempt.purpose !== 'identity_install') {
        return app.clientId;
    }
    const [identity] = await db
        .select({ clientId: linearIdentitiesTable.oauthClientId })
        .from(linearIdentitiesTable)
        .where(eq(linearIdentitiesTable.id, attempt.identityId ?? ''))
        .limit(1);
    return identity?.clientId ?? null;
}

/**
 * A token that bound nothing is revoked here rather than through the outbox:
 * it was never stored, and an outbox row would be its first persistence.
 */
async function revokeUnbound(app: LinearApp, clientId: string, tokens: LinearTokenPair) {
    try {
        await revokeLinearToken(app.fetch, { clientId, token: tokens.refreshToken });
    } catch (cause) {
        console.error(
            '[haus] Linear token revocation after a failed install failed',
            cause instanceof LinearApiError ? cause.failure : 'unknown'
        );
    }
}

/** Tool inventory runs after commit, against a freshly opened client. */
async function refreshInventory(
    runtime: LinearCallbackDependencies['mcpRuntime'],
    connectionId: string
) {
    try {
        await runtime.closeConnection(connectionId);
        await runtime.inventory.refresh(connectionId);
    } catch (cause) {
        // The periodic inventory retries; the binding already committed.
        console.error(
            '[haus] Linear tool inventory after install failed',
            cause instanceof Error ? cause.name : 'unknown'
        );
    }
}

async function linearPage(
    dependencies: LinearCallbackDependencies,
    serverId: string,
    connectionId: string | null
) {
    const [server] = await dependencies.db
        .select({ slug: serversTable.slug })
        .from(serversTable)
        .where(eq(serversTable.id, serverId))
        .limit(1);
    const origin = dependencies.appOrigin.replace(/\/$/u, '');
    const connections = `${origin}/s/${encodeURIComponent(server?.slug ?? '')}/settings/connections`;
    return connectionId ? `${connections}/${encodeURIComponent(connectionId)}` : connections;
}

function page(reply: FastifyReply, status: number, title: string, message: string) {
    return reply
        .code(status)
        .header('content-type', 'text/html; charset=utf-8')
        .send(
            `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`
        );
}
