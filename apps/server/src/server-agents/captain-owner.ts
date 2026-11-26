import { and, asc, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, serverMembershipsTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function resolveCaptainOwner(
    db: Reader,
    input: { creator: { agentId: string } | { userId: string }; serverId: string }
) {
    if ('userId' in input.creator) {
        return input.creator.userId;
    }
    const [creator] = await db
        .select({ ownerUserId: agentsTable.ownerUserId })
        .from(agentsTable)
        .innerJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, agentsTable.serverId),
                eq(serverMembershipsTable.userId, agentsTable.ownerUserId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .where(
            and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.creator.agentId))
        )
        .limit(1);
    return creator?.ownerUserId ?? (await requireServerOwner(db, input.serverId));
}

export async function handCaptainsToServerOwner(
    tx: HausDatabase,
    input: { serverId: string; userId: string }
) {
    const owner = await requireServerOwner(tx, input.serverId);
    await tx
        .update(agentsTable)
        .set({ ownerUserId: owner })
        .where(
            and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.ownerUserId, input.userId))
        );
}

async function requireServerOwner(db: Reader, serverId: string) {
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
    if (!row) {
        throw new Error(`Server ${serverId} has no active owner to own its Captains.`);
    }
    return row.userId;
}
