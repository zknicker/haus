import type { LinearCredentialState } from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    linearCredentialsTable,
    linearIdentitiesTable,
    linearOutboxTable,
} from '../postgres/schema.ts';
import type { LinearTokenPair } from './linear-api.ts';

// Actor credentials (specs/linear-app.md#tokens): one row per actor, the
// workspace actor (no identity) or one identity. Rows never leave the Server.

export type LinearCredential = typeof linearCredentialsTable.$inferSelect;

/** Which OAuth client a credential refreshes with: the Haus app, or the identity's own app. */
export interface LinearCredentialClient {
    credential: LinearCredential;
    /** The identity's client id; null for the workspace actor (the Haus app's client). */
    identityClientId: string | null;
}

/**
 * Creates or replaces one actor's credential with a fresh pair at a new
 * generation. A reinstall is the only way back to `valid` (no in-place recovery).
 */
export async function storeLinearCredential(
    tx: HausDatabase,
    input: {
        identityId: string | null;
        now: Date;
        serverId: string;
        tokens: LinearTokenPair;
        workspaceId: string;
    }
): Promise<LinearCredential> {
    const existing = await readActorCredential(tx, input);
    const values = {
        accessExpiresAt: input.tokens.accessExpiresAt,
        accessToken: input.tokens.accessToken,
        refreshToken: input.tokens.refreshToken,
        scopes: input.tokens.scopes,
        state: 'valid' as const,
        updatedAt: input.now,
    };
    const [row] = existing
        ? await tx
              .update(linearCredentialsTable)
              .set({ ...values, generation: existing.generation + 1 })
              .where(eq(linearCredentialsTable.id, existing.id))
              .returning()
        : await tx
              .insert(linearCredentialsTable)
              .values({
                  ...values,
                  createdAt: input.now,
                  id: createOpaqueId('lna'),
                  identityId: input.identityId,
                  serverId: input.serverId,
                  workspaceId: input.workspaceId,
              })
              .returning();
    if (!row) {
        throw new Error('The Linear credential was not saved.');
    }
    return row;
}

/** The workspace actor's credential, or one identity's. */
export async function readActorCredential(
    db: HausDatabase,
    input: { identityId: string | null; workspaceId: string }
): Promise<LinearCredential | null> {
    const [row] = await db
        .select()
        .from(linearCredentialsTable)
        .where(
            and(
                eq(linearCredentialsTable.workspaceId, input.workspaceId),
                input.identityId
                    ? eq(linearCredentialsTable.identityId, input.identityId)
                    : isNull(linearCredentialsTable.identityId)
            )
        )
        .limit(1);
    return row ?? null;
}

/** One credential with the client id its refresh uses. */
export async function readCredentialClient(
    db: HausDatabase,
    credentialId: string
): Promise<LinearCredentialClient | null> {
    const [row] = await db
        .select({
            credential: linearCredentialsTable,
            identityClientId: linearIdentitiesTable.oauthClientId,
        })
        .from(linearCredentialsTable)
        .leftJoin(
            linearIdentitiesTable,
            eq(linearIdentitiesTable.id, linearCredentialsTable.identityId)
        )
        .where(eq(linearCredentialsTable.id, credentialId))
        .limit(1);
    return row ?? null;
}

/**
 * What a `token_revoke` outbox row carries: the refresh token (revoking it
 * revokes its access tokens) and the identity's client id, or null for the
 * Haus app's own client. The row carries its own token because the credential
 * row is gone by the time the worker runs.
 */
export interface LinearTokenRevokeInput {
    clientId: string | null;
    token: string;
}

/** Deletes credentials and enqueues a `token_revoke` for each live one. */
export async function revokeLinearCredentials(
    tx: HausDatabase,
    input: { credentialIds: string[]; now: Date }
): Promise<void> {
    if (input.credentialIds.length === 0) {
        return;
    }
    const rows = await tx
        .select({
            credential: linearCredentialsTable,
            identityClientId: linearIdentitiesTable.oauthClientId,
        })
        .from(linearCredentialsTable)
        .leftJoin(
            linearIdentitiesTable,
            eq(linearIdentitiesTable.id, linearCredentialsTable.identityId)
        )
        .where(inArray(linearCredentialsTable.id, input.credentialIds));
    for (const { credential, identityClientId } of rows) {
        if (credential.state !== 'revoked') {
            const revoke: LinearTokenRevokeInput = {
                clientId: credential.identityId ? identityClientId : null,
                token: credential.refreshToken,
            };
            await tx.insert(linearOutboxTable).values({
                createdAt: input.now,
                credentialId: credential.id,
                id: createOpaqueId('lnx'),
                input: { ...revoke },
                kind: 'token_revoke',
                nextAttemptAt: input.now,
                serverId: credential.serverId,
                state: 'queued',
                workspaceId: credential.workspaceId,
            });
        }
    }
    await tx
        .delete(linearCredentialsTable)
        .where(inArray(linearCredentialsTable.id, input.credentialIds));
}

/**
 * Moves a credential out of `valid` only at the generation the caller read.
 * Answers false when a newer generation won; the caller re-reads and adopts it.
 */
export async function markCredentialAtGeneration(
    tx: HausDatabase,
    input: {
        credentialId: string;
        generation: number;
        now: Date;
        state: Exclude<LinearCredentialState, 'valid'>;
    }
): Promise<LinearCredential | null> {
    const [row] = await tx
        .update(linearCredentialsTable)
        .set({ state: input.state, updatedAt: input.now })
        .where(
            and(
                eq(linearCredentialsTable.id, input.credentialId),
                eq(linearCredentialsTable.generation, input.generation)
            )
        )
        .returning();
    return row ?? null;
}
