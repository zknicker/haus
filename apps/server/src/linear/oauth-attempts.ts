import { createHash, randomBytes } from 'node:crypto';
import type { LinearOauthPurpose } from '@haus/api';
import { and, eq, gt, isNull, lte } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { linearOauthAttemptsTable } from '../postgres/schema.ts';
import { linearAppScopes, linearAuthorizeUrl } from './linear-api.ts';

// OAuth attempts are rows, not memory (specs/linear-app.md#binding-and-authority):
// a restart keeps installs in flight, and only the SHA-256 of the state is
// stored. Every install is authorization code with PKCE (S256).

const attemptTtlMs = 15 * 60_000;

export type LinearAttemptTarget =
    | { purpose: 'workspace_install' }
    | { connectionId: string; purpose: 'workspace_reconnect' }
    | { connectionId: string; identityId: string; purpose: 'identity_install' };

export type LinearAttempt = typeof linearOauthAttemptsTable.$inferSelect & {
    purpose: LinearOauthPurpose;
};

/** Records one attempt and answers the Linear authorize URL that carries its state. */
export async function startLinearAttempt(
    db: HausDatabase,
    input: {
        clientId: string;
        now: Date;
        redirectUri: string;
        serverId: string;
        target: LinearAttemptTarget;
        userId: string;
    }
): Promise<{ authorizeUrl: string }> {
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const { target } = input;
    await db.insert(linearOauthAttemptsTable).values({
        codeVerifier,
        connectionId: target.purpose === 'workspace_install' ? null : target.connectionId,
        createdAt: input.now,
        expiresAt: new Date(input.now.getTime() + attemptTtlMs),
        id: createOpaqueId('lno'),
        identityId: target.purpose === 'identity_install' ? target.identityId : null,
        initiatedByUserId: input.userId,
        purpose: target.purpose,
        serverId: input.serverId,
        stateHash: hashLinearState(state),
    });
    const url = new URL(linearAuthorizeUrl);
    url.search = new URLSearchParams({
        actor: 'app',
        client_id: input.clientId,
        code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
        code_challenge_method: 'S256',
        prompt: 'consent',
        redirect_uri: input.redirectUri,
        response_type: 'code',
        scope: linearAppScopes.join(','),
        state,
    }).toString();
    return { authorizeUrl: url.toString() };
}

/**
 * Takes the attempt exactly once: `consumed_at` is set only where it is null
 * and the attempt has not expired. Missing, expired, and used states all
 * answer null.
 */
export async function consumeLinearAttempt(
    db: HausDatabase,
    state: string,
    now: Date
): Promise<LinearAttempt | null> {
    const [attempt] = await db
        .update(linearOauthAttemptsTable)
        .set({ consumedAt: now })
        .where(
            and(
                eq(linearOauthAttemptsTable.stateHash, hashLinearState(state)),
                isNull(linearOauthAttemptsTable.consumedAt),
                gt(linearOauthAttemptsTable.expiresAt, now)
            )
        )
        .returning();
    return attempt ?? null;
}

/** Expired attempts carry nothing worth keeping; the hourly sweep drops them. */
export async function sweepLinearAttempts(db: HausDatabase, now: Date): Promise<number> {
    const removed = await db
        .delete(linearOauthAttemptsTable)
        .where(lte(linearOauthAttemptsTable.expiresAt, now))
        .returning({ id: linearOauthAttemptsTable.id });
    return removed.length;
}

export function hashLinearState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
}
