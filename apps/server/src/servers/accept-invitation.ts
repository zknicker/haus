import { and, eq, type SQL, sql } from 'drizzle-orm';
import { listVerifiedEmails } from '../identity/human-identities.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    serverInvitationsTable,
    serverMembershipsTable,
    serversTable,
} from '../postgres/schema.ts';
import {
    AlreadyServerMemberError,
    InvitationEmailMismatchError,
    InvitationNotAcceptableError,
} from './invitation-access.ts';
import { hashInvitationToken } from './invitation-token.ts';
import { clearPersonalWork, joinAllChannel } from './member-personal-work.ts';
import { lockServerRow } from './server-lock.ts';

export interface AcceptedServerInvitation {
    serverId: string;
    serverSlug: string;
    /** The new member's user id, for the `member.updated` announcement. */
    userId: string;
}

/**
 * One transaction validates the invitation, consumes it, and commits the fresh
 * Member stint joined to exactly `#all`. A non-locking token lookup identifies
 * the Server, then the transaction takes the Server row before the invitation
 * row. Every membership-authorized write uses that order, avoiding an
 * accept-versus-revoke deadlock while the invitation lock still makes the token
 * single-use.
 *
 * Verified email aliases were captured from the signed Cloudflare identity at
 * admission time, so acceptance reads them locally before opening its lock.
 */
export async function acceptServerInvitation(
    db: HausDatabase,
    userId: string,
    token: string
): Promise<AcceptedServerInvitation> {
    const verifiedEmails = await listVerifiedEmails(db, userId);
    const tokenHash = hashInvitationToken(token);
    const [located] = await db
        .select({ serverId: serverInvitationsTable.serverId })
        .from(serverInvitationsTable)
        .where(eq(serverInvitationsTable.tokenHash, tokenHash))
        .limit(1);

    if (!located) {
        throw new InvitationNotAcceptableError();
    }

    return await db.transaction(async (tx) => {
        await lockServerRow(tx, located.serverId);

        const [invitation] = await tx
            .select({
                email: serverInvitationsTable.email,
                id: serverInvitationsTable.id,
                isLive: isLiveInvitation(),
                serverId: serverInvitationsTable.serverId,
            })
            .from(serverInvitationsTable)
            .where(
                and(
                    eq(serverInvitationsTable.tokenHash, tokenHash),
                    eq(serverInvitationsTable.serverId, located.serverId)
                )
            )
            .limit(1)
            .for('update');

        if (!invitation?.isLive) {
            throw new InvitationNotAcceptableError();
        }

        if (!verifiedEmails.includes(invitation.email)) {
            throw new InvitationEmailMismatchError();
        }

        const [server] = await tx
            .select({ slug: serversTable.slug })
            .from(serversTable)
            .where(eq(serversTable.id, invitation.serverId))
            .limit(1);

        if (!server) {
            throw new InvitationNotAcceptableError();
        }

        const [standing] = await tx
            .select({ id: serverMembershipsTable.id, revokedAt: serverMembershipsTable.revokedAt })
            .from(serverMembershipsTable)
            .where(
                and(
                    eq(serverMembershipsTable.serverId, invitation.serverId),
                    eq(serverMembershipsTable.userId, userId)
                )
            )
            .limit(1)
            .for('update');

        if (standing && standing.revokedAt === null) {
            // Their existing standing, including any administrative role, is
            // theirs to keep; consuming the invitation would silently demote it.
            throw new AlreadyServerMemberError();
        }

        if (standing) {
            // Reset in place: the row is the anchor authored history points at,
            // so a returning human reuses it as a brand-new Member stint.
            await tx
                .update(serverMembershipsTable)
                .set({
                    joinedAt: sql`now()`,
                    revokedAt: null,
                    role: 'member',
                    stint: sql`${serverMembershipsTable.stint} + 1`,
                })
                .where(eq(serverMembershipsTable.id, standing.id));
        } else {
            await tx.insert(serverMembershipsTable).values({
                id: createOpaqueId('mem'),
                role: 'member',
                serverId: invitation.serverId,
                userId,
            });
        }

        await clearPersonalWork(tx, invitation.serverId, userId);
        await joinAllChannel(tx, invitation.serverId, userId);

        await tx
            .update(serverInvitationsTable)
            .set({ acceptedAt: sql`now()`, acceptedUserId: userId })
            .where(eq(serverInvitationsTable.id, invitation.id));

        return { serverId: invitation.serverId, serverSlug: server.slug, userId };
    });
}

/**
 * Whether an invitation is still usable, judged entirely by PostgreSQL. Expiry
 * has to be read on the same clock that stamps `expires_at` and that the listed
 * status is derived from — comparing against the application's clock would let
 * an invitation read `pending` in the directory while acceptance called it
 * lapsed, or the reverse.
 *
 * Unknown, revoked, consumed, and lapsed tokens are all simply unavailable. One
 * answer for every case keeps the endpoint from confirming which tokens exist.
 */
export function isLiveInvitation(): SQL<boolean> {
    return sql<boolean>`(
        ${serverInvitationsTable.revokedAt} is null
        and ${serverInvitationsTable.acceptedAt} is null
        and ${serverInvitationsTable.expiresAt} > now()
    )`;
}
