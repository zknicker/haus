import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { serversTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import type { ServerSummary } from './contracts.ts';
import { requireServerMembership } from './server-access.ts';
import { lockServerRow } from './server-lock.ts';

/** Renames a Haus server. The slug is its permanent address and never moves. */
export async function renameServer(
    db: HausDatabase,
    member: HausUser | null,
    input: { displayName: string; serverId: string }
): Promise<ServerSummary> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const server = await requireServerMembership(tx, member, input.serverId);

        await tx
            .update(serversTable)
            .set({ displayName: input.displayName })
            .where(eq(serversTable.id, server.id));

        return { ...server, displayName: input.displayName };
    });
}
