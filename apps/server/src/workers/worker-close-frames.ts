import type { WorkerCloseCommand } from '@haus/api';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workersTable } from '../postgres/schema.ts';
import type { WorkerFrame } from './worker-effects.ts';

export async function workerCloseFrames(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    workerIds: readonly string[]
) {
    if (workerIds.length === 0) {
        return [];
    }
    const closed = await db
        .select({ computerId: workersTable.carrierComputerId, workerId: workersTable.id })
        .from(workersTable)
        .where(
            and(
                eq(workersTable.serverId, serverId),
                inArray(workersTable.id, [...new Set(workerIds)]),
                eq(workersTable.place, 'computer'),
                isNotNull(workersTable.closedAt)
            )
        );
    return closed.map(
        ({ computerId, workerId }) =>
            ({
                computerId,
                frame: { type: 'worker-close', workerId } satisfies WorkerCloseCommand,
            }) satisfies WorkerFrame
    );
}

export async function heldWorkerCloseFrames(
    db: Pick<HausDatabase, 'select'>,
    computer: { id: string; serverId: string },
    heldWorkerIds: readonly string[]
) {
    const held = [...new Set(heldWorkerIds)];
    if (held.length === 0) {
        return [];
    }
    const rows = await db
        .select({
            closedAt: workersTable.closedAt,
            computerId: workersTable.carrierComputerId,
            workerId: workersTable.id,
        })
        .from(workersTable)
        .where(and(eq(workersTable.serverId, computer.serverId), inArray(workersTable.id, held)));
    const byId = new Map(rows.map((row) => [row.workerId, row]));
    return held
        .filter((workerId) => {
            const row = byId.get(workerId);
            return !row || (row.computerId === computer.id && row.closedAt !== null);
        })
        .map(
            (workerId) =>
                ({
                    computerId: computer.id,
                    frame: { type: 'worker-close', workerId } satisfies WorkerCloseCommand,
                }) satisfies WorkerFrame
        );
}
