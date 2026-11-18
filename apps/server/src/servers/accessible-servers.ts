import { and, asc, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverMembershipsTable, serversTable } from '../postgres/schema.ts';
import type { ServerSummary } from './contracts.ts';

/** The Haus servers one human may open, newest membership last. */
export async function listAccessibleServers(
    db: HausDatabase,
    userId: string
): Promise<ServerSummary[]> {
    return await db
        .select({
            displayName: serversTable.displayName,
            id: serversTable.id,
            role: serverMembershipsTable.role,
            slug: serversTable.slug,
        })
        .from(serverMembershipsTable)
        .innerJoin(serversTable, eq(serversTable.id, serverMembershipsTable.serverId))
        .where(
            and(
                eq(serverMembershipsTable.userId, userId),
                isNull(serverMembershipsTable.revokedAt),
                isNull(serversTable.deletedAt)
            )
        )
        .orderBy(asc(serversTable.createdAt));
}
