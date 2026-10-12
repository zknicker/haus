import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';

/**
 * Whether the Computer that launched a work still exists. `computer_id` is a
 * historical pointer with no foreign key (ADR 0044), so work outlives its
 * removed Computer; nothing can reach its provider any longer, and cancel or
 * follow-up must refuse rather than send a frame nowhere.
 */
export async function hasCloudAgentWorkComputer(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    computerId: string
): Promise<boolean> {
    const [computer] = await db
        .select({ id: computersTable.id })
        .from(computersTable)
        .where(and(eq(computersTable.serverId, serverId), eq(computersTable.id, computerId)))
        .limit(1);
    return Boolean(computer);
}
