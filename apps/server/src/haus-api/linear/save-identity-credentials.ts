import { linearSaveIdentityCredentialsInputSchema } from '@haus/api';
import { eq } from 'drizzle-orm';
import { requireLinearAdmin, requireLinearIdentity } from '../../linear/authority.ts';
import { LinearRefusedError } from '../../linear/linear-errors.ts';
import type { HausDatabase } from '../../postgres/connection.ts';
import { violatesConstraint } from '../../postgres/constraint-violation.ts';
import {
    linearIdentitiesTable,
    linearIdentitySecretsTable,
    linearWorkspacesTable,
} from '../../postgres/schema.ts';
import { lockServerRow } from '../../servers/server-lock.ts';
import { announceLinearUpdated, linearClock, linearProcedure } from './procedure.ts';

/** A rotated webhook secret keeps the previous one valid this long. */
const previousSecretMs = 24 * 60 * 60_000;

/**
 * Saves an identity app's client id (only while `draft`) and webhook signing
 * secret. A new secret rotates: the previous one stays valid for 24 hours.
 */
export const linearSaveIdentityCredentials = linearProcedure
    .input(linearSaveIdentityCredentialsInputSchema)
    .mutation(async ({ ctx, input }) => {
        const connectionId = await ctx.hausDb
            .transaction(async (tx) => {
                await lockServerRow(tx, input.serverId);
                await requireLinearAdmin(tx, ctx.member, input.serverId);
                const identity = await requireLinearIdentity(tx, input);
                const now = linearClock.now();
                if (input.clientId && input.clientId !== identity.oauthClientId) {
                    if (identity.status !== 'draft') {
                        throw new LinearRefusedError(
                            'BAD_REQUEST',
                            'linear_identity_state',
                            'The client id is fixed once installed. Remove the identity to use another app.'
                        );
                    }
                    if (input.clientId === ctx.linear.app?.clientId) {
                        throw new LinearRefusedError(
                            'BAD_REQUEST',
                            'linear_identity_mismatch',
                            "That is the Haus app's client id, not this Agent's own app."
                        );
                    }
                    await tx
                        .update(linearIdentitiesTable)
                        .set({ oauthClientId: input.clientId, updatedAt: now })
                        .where(eq(linearIdentitiesTable.id, identity.id));
                }
                await saveWebhookSecret(tx, {
                    identityId: identity.id,
                    now,
                    secret: input.webhookSigningSecret,
                    serverId: input.serverId,
                });
                const [workspace] = await tx
                    .select({ connectionId: linearWorkspacesTable.connectionId })
                    .from(linearWorkspacesTable)
                    .where(eq(linearWorkspacesTable.id, identity.workspaceId))
                    .limit(1);
                return workspace?.connectionId ?? null;
            })
            .catch((cause: unknown) => {
                if (violatesConstraint(cause, 'linear_identities_live_client_key')) {
                    throw new LinearRefusedError(
                        'CONFLICT',
                        'linear_identity_already_bound',
                        'This Linear app is already a Haus Agent identity.'
                    );
                }
                throw cause;
            });
        if (connectionId) {
            announceLinearUpdated({ connectionId, serverId: input.serverId });
        }
    });

async function saveWebhookSecret(
    tx: HausDatabase,
    input: { identityId: string; now: Date; secret: string; serverId: string }
) {
    const [current] = await tx
        .select()
        .from(linearIdentitySecretsTable)
        .where(eq(linearIdentitySecretsTable.identityId, input.identityId))
        .limit(1);
    if (!current) {
        await tx.insert(linearIdentitySecretsTable).values({
            identityId: input.identityId,
            serverId: input.serverId,
            updatedAt: input.now,
            webhookSecret: input.secret,
        });
        return;
    }
    if (current.webhookSecret === input.secret) {
        return;
    }
    await tx
        .update(linearIdentitySecretsTable)
        .set({
            previousExpiresAt: new Date(input.now.getTime() + previousSecretMs),
            previousWebhookSecret: current.webhookSecret,
            updatedAt: input.now,
            webhookSecret: input.secret,
        })
        .where(eq(linearIdentitySecretsTable.identityId, input.identityId));
}
