import type { WorkerPlaceKind, WorkerPlaceView } from '@haus/api';
import { sql } from 'drizzle-orm';
import { computersTable } from '../postgres/schema.ts';

export const computerNameSql = sql<
    string | null
>`nullif(btrim(${computersTable.reportedInventory} ->> 'name'), '')`;

export function defaultWorkerPlaceOf(row: {
    defaultWorkerComputerId: string | null;
    defaultWorkerComputerName: string | null;
    defaultWorkerPlace: WorkerPlaceKind | null;
}) {
    if (row.defaultWorkerPlace === null) {
        return null;
    }
    if (row.defaultWorkerPlace !== 'computer') {
        return { kind: row.defaultWorkerPlace } satisfies WorkerPlaceView;
    }
    if (row.defaultWorkerComputerId === null) {
        throw new Error('A Computer default place has no Computer.');
    }
    return {
        computerId: row.defaultWorkerComputerId,
        computerName: row.defaultWorkerComputerName,
        kind: 'computer',
    } satisfies WorkerPlaceView;
}
