import type { WorkerPlace, WorkerPlaceKind, WorkerPlaceView } from '@haus/api';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, workersTable } from '../postgres/schema.ts';

interface PlaceRow {
    carrierComputerId: string;
    place: WorkerPlaceKind;
}

export function workerPlaceOf(row: PlaceRow) {
    return row.place === 'computer'
        ? ({ computerId: row.carrierComputerId, kind: 'computer' } satisfies WorkerPlace)
        : ({ kind: row.place } satisfies WorkerPlace);
}

export function workerPlaceViewOf(row: PlaceRow, computerName: string | null) {
    return row.place === 'computer'
        ? ({
              computerId: row.carrierComputerId,
              computerName,
              kind: 'computer',
          } satisfies WorkerPlaceView)
        : ({ kind: row.place } satisfies WorkerPlaceView);
}

export async function readPlaceComputerNames(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    workerIds: readonly string[]
) {
    if (workerIds.length === 0) {
        return new Map<string, string | null>();
    }
    const rows = await db
        .select({
            name: sql<string | null>`${computersTable.reportedInventory} ->> 'name'`,
            workerId: workersTable.id,
        })
        .from(workersTable)
        .innerJoin(
            computersTable,
            and(
                eq(computersTable.serverId, workersTable.serverId),
                eq(computersTable.id, workersTable.carrierComputerId)
            )
        )
        .where(
            and(
                eq(workersTable.serverId, serverId),
                inArray(workersTable.id, [...workerIds]),
                eq(workersTable.place, 'computer')
            )
        );
    return new Map(rows.map(({ name, workerId }) => [workerId, name]));
}
