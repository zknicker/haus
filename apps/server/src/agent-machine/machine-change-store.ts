import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentMachineChangesTable, agentsTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export type PendingMachineChange = typeof agentMachineChangesTable.$inferSelect;

export async function readPendingChange(db: Reader, input: { agentId: string; serverId: string }) {
    const [change] = await db
        .select()
        .from(agentMachineChangesTable)
        .where(
            and(
                eq(agentMachineChangesTable.serverId, input.serverId),
                eq(agentMachineChangesTable.agentId, input.agentId)
            )
        )
        .limit(1);
    return change ?? null;
}

export async function recordPendingChange(
    db: HausDatabase,
    input: {
        agentId: string;
        computerId: string;
        fromLastSynced: boolean;
        requestedByUserId: string;
        serverId: string;
    }
) {
    const fresh = {
        ...input,
        flushId: null,
        flushSentAt: null,
        flushedAt: null,
        requestedAt: new Date(),
    };
    await db
        .insert(agentMachineChangesTable)
        .values(fresh)
        .onConflictDoUpdate({
            set: fresh,
            target: [agentMachineChangesTable.serverId, agentMachineChangesTable.agentId],
        });
}

export async function dropPendingChange(
    db: HausDatabase,
    input: { agentId: string; serverId: string }
) {
    await db
        .delete(agentMachineChangesTable)
        .where(
            and(
                eq(agentMachineChangesTable.serverId, input.serverId),
                eq(agentMachineChangesTable.agentId, input.agentId)
            )
        );
}

export async function noteFlushSent(
    db: HausDatabase,
    input: { agentId: string; flushId: string; serverId: string }
) {
    await db
        .update(agentMachineChangesTable)
        .set({ flushedAt: null, flushId: input.flushId, flushSentAt: new Date() })
        .where(
            and(
                eq(agentMachineChangesTable.serverId, input.serverId),
                eq(agentMachineChangesTable.agentId, input.agentId)
            )
        );
}

export async function confirmFlush(
    db: HausDatabase,
    input: { agentId: string; pushId: string; serverId: string }
) {
    const confirmed = await db
        .update(agentMachineChangesTable)
        .set({ flushedAt: new Date() })
        .where(
            and(
                eq(agentMachineChangesTable.serverId, input.serverId),
                eq(agentMachineChangesTable.agentId, input.agentId),
                eq(agentMachineChangesTable.flushId, input.pushId),
                isNull(agentMachineChangesTable.flushedAt)
            )
        )
        .returning({ agentId: agentMachineChangesTable.agentId });
    return confirmed.length > 0;
}

export async function readFlushSource(
    db: Reader,
    input: { agentId: string; pushId: string; serverId: string }
) {
    const [source] = await db
        .select({
            placementGeneration: agentsTable.placementGeneration,
            resetGeneration: agentsTable.resetGeneration,
        })
        .from(agentMachineChangesTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, agentMachineChangesTable.serverId),
                eq(agentsTable.id, agentMachineChangesTable.agentId)
            )
        )
        .where(
            and(
                eq(agentMachineChangesTable.serverId, input.serverId),
                eq(agentMachineChangesTable.agentId, input.agentId),
                eq(agentMachineChangesTable.flushId, input.pushId)
            )
        )
        .limit(1);
    return source ?? null;
}

export async function listPendingChanges(db: Reader, filter: { fromComputerId?: string } = {}) {
    return await db
        .select({
            agentId: agentMachineChangesTable.agentId,
            serverId: agentMachineChangesTable.serverId,
        })
        .from(agentMachineChangesTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, agentMachineChangesTable.serverId),
                eq(agentsTable.id, agentMachineChangesTable.agentId)
            )
        )
        .where(
            filter.fromComputerId ? eq(agentsTable.computerId, filter.fromComputerId) : undefined
        );
}
