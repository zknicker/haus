import type { WorkerHeldFrame } from '@haus/api';
import { and, eq, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workersTable } from '../postgres/schema.ts';

export async function recordKeptWorktrees(
    db: HausDatabase,
    scope: { computerId: string; serverId: string },
    kept: WorkerHeldFrame['keptWorktrees']
) {
    const carried = and(
        eq(workersTable.serverId, scope.serverId),
        eq(workersTable.carrierComputerId, scope.computerId),
        eq(workersTable.place, 'computer')
    );
    const changed: string[] = [];
    for (const { path, workerId } of new Map(
        kept.map((entry) => [entry.workerId, entry])
    ).values()) {
        const rows = await db
            .update(workersTable)
            .set({ keptWorktreePath: path, updatedAt: sql`now()` })
            .where(
                and(
                    carried,
                    eq(workersTable.id, workerId),
                    sql`${workersTable.keptWorktreePath} is distinct from ${path}`
                )
            )
            .returning({ id: workersTable.id });
        changed.push(...rows.map((row) => row.id));
    }
    const listed = kept.map((entry) => entry.workerId);
    const cleared = await db
        .update(workersTable)
        .set({ keptWorktreePath: null, updatedAt: sql`now()` })
        .where(
            and(
                carried,
                isNotNull(workersTable.keptWorktreePath),
                listed.length > 0 ? notInArray(workersTable.id, listed) : undefined
            )
        )
        .returning({ id: workersTable.id });
    return [...changed, ...cleared.map((row) => row.id)];
}
