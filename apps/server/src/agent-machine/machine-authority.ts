import { and, eq } from 'drizzle-orm';
import { isAgentAllowedOn } from '../computer-access/agent-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function destinationAllows(
    db: Reader,
    input: { agentId: string; computerId: string; serverId: string; userId: string }
) {
    if (await isAgentAllowedOn(db, input)) {
        return true;
    }
    const [computer] = await db
        .select({ attachedByUserId: computersTable.attachedByUserId })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, input.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .limit(1);
    return computer?.attachedByUserId === input.userId;
}
