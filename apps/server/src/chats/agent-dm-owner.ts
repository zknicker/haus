import { and, asc, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, serverMembershipsTable } from '../postgres/schema.ts';

/**
 * Which human owns the Owner DM of an Agent that no human created.
 *
 * An Agent-created Agent has no `created_by_user_id`, so the DM's human is the
 * one the creation was for: the human on the DM the create ran in, then the one
 * human the creating Agent already DMs with, and finally the Server Owner.
 * Returns `null` when the Server has no active human to hand the DM to.
 */
export async function resolveAgentDmOwnerUserId(
    db: Pick<HausDatabase, 'select'>,
    input: { contextChatId: string | null; creatorAgentId: string; serverId: string }
): Promise<string | null> {
    if (input.contextChatId) {
        const human = await readDmChatHuman(db, input.serverId, input.contextChatId);
        if (human) {
            return human;
        }
    }
    const peer = await readSoleAgentDmHuman(db, input.serverId, input.creatorAgentId);
    if (peer) {
        return peer;
    }
    return await readServerOwnerUserId(db, input.serverId);
}

/** The active human on one DM Chat, or null when the Chat is not a live DM. */
async function readDmChatHuman(db: Pick<HausDatabase, 'select'>, serverId: string, chatId: string) {
    const [row] = await db
        .select({ userId: chatsTable.dmMemberOneUserId })
        .from(chatsTable)
        .innerJoin(serverMembershipsTable, activeDmMembership())
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                eq(chatsTable.id, chatId),
                eq(chatsTable.kind, 'dm')
            )
        )
        .limit(1);
    return row?.userId ?? null;
}

/** The human an Agent already DMs with, only when exactly one such human exists. */
async function readSoleAgentDmHuman(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    agentId: string
) {
    const rows = await db
        .select({ userId: chatsTable.dmMemberOneUserId })
        .from(chatsTable)
        .innerJoin(serverMembershipsTable, activeDmMembership())
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                eq(chatsTable.kind, 'dm'),
                eq(chatsTable.dmAgentId, agentId)
            )
        )
        .limit(5);
    const humans = new Set(rows.map((row) => row.userId).filter((userId) => userId !== null));
    return humans.size === 1 ? [...humans][0] : null;
}

/** The longest-standing Server Owner, the Server's last resort for ownership. */
async function readServerOwnerUserId(db: Pick<HausDatabase, 'select'>, serverId: string) {
    const [row] = await db
        .select({ userId: serverMembershipsTable.userId })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, serverId),
                eq(serverMembershipsTable.role, 'owner'),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .orderBy(asc(serverMembershipsTable.joinedAt), asc(serverMembershipsTable.userId))
        .limit(1);
    return row?.userId ?? null;
}

/** A DM only names its human while that human's exact membership stint stands. */
function activeDmMembership() {
    return and(
        eq(serverMembershipsTable.serverId, chatsTable.serverId),
        eq(serverMembershipsTable.userId, chatsTable.dmMemberOneUserId),
        eq(serverMembershipsTable.stint, chatsTable.dmMemberOneStint),
        isNull(serverMembershipsTable.revokedAt)
    );
}
