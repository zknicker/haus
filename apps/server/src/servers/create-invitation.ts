import type { ServerInvitation } from '@haus/api';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { serverInvitationsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    InvitationEmailTakenError,
    invitationColumns,
    requireInvitationAuthority,
    toServerInvitation,
} from './invitation-access.ts';
import { createInvitationToken, hashInvitationToken } from './invitation-token.ts';
import { lockServerRow } from './server-lock.ts';

/**
 * Seven days as an exact duration. `interval '7 days'` is calendar arithmetic
 * on `timestamptz` and shifts by an hour across a daylight-saving boundary; an
 * hours interval is absolute, so every invitation gets the same lifetime.
 */
const invitationLifetime = sql`interval '168 hours'`;

export interface CreatedServerInvitation {
    invitation: ServerInvitation;
    /** Disclosed once, to the issuer, and never stored in the clear. */
    token: string;
}

export async function createServerInvitation(
    db: HausDatabase,
    member: HausUser | null,
    input: { email: string; serverId: string }
): Promise<CreatedServerInvitation> {
    if (!member) {
        throw new Error('An authorized Server member is required to invite.');
    }

    const token = createInvitationToken();

    try {
        const invitation = await db.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            const server = await requireInvitationAuthority(tx, member, input.serverId);

            // A lapsed invitation must not hold the address hostage. Retiring it
            // here keeps the live-invitation index honest without letting an
            // expired row block a fresh invite.
            await tx
                .update(serverInvitationsTable)
                .set({ revokedAt: sql`now()` })
                .where(
                    and(
                        eq(serverInvitationsTable.serverId, server.id),
                        eq(serverInvitationsTable.email, input.email),
                        isNull(serverInvitationsTable.acceptedAt),
                        isNull(serverInvitationsTable.revokedAt),
                        lte(serverInvitationsTable.expiresAt, sql`now()`)
                    )
                );

            const [created] = await tx
                .insert(serverInvitationsTable)
                .values({
                    email: input.email,
                    expiresAt: sql`now() + ${invitationLifetime}`,
                    id: createOpaqueId('inv'),
                    invitedByUserId: member.id,
                    serverId: server.id,
                    tokenHash: hashInvitationToken(token),
                })
                .returning(invitationColumns);

            return created;
        });

        return { invitation: toServerInvitation(invitation), token };
    } catch (cause) {
        if (violatesConstraint(cause, 'server_invitations_live_email_key')) {
            throw new InvitationEmailTakenError(input.email);
        }

        throw cause;
    }
}
