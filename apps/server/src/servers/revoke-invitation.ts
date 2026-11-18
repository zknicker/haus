import type { ServerInvitation } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverInvitationsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    InvitationNotFoundError,
    invitationColumns,
    requireInvitationAuthority,
    toServerInvitation,
} from './invitation-access.ts';
import { lockServerRow } from './server-lock.ts';

/**
 * Revocation is immediate and only applies to a live invitation. An already
 * accepted or revoked invitation is not found, so revoking never rewrites a
 * consumed one.
 */
export async function revokeServerInvitation(
    db: HausDatabase,
    member: HausUser | null,
    input: { invitationId: string; serverId: string }
): Promise<ServerInvitation> {
    const revoked = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const server = await requireInvitationAuthority(tx, member, input.serverId);
        const [invitation] = await tx
            .update(serverInvitationsTable)
            .set({ revokedAt: sql`now()` })
            .where(
                and(
                    eq(serverInvitationsTable.serverId, server.id),
                    eq(serverInvitationsTable.id, input.invitationId),
                    isNull(serverInvitationsTable.acceptedAt),
                    isNull(serverInvitationsTable.revokedAt)
                )
            )
            .returning(invitationColumns);

        if (!invitation) {
            throw new InvitationNotFoundError();
        }

        return invitation;
    });

    return toServerInvitation(revoked);
}
