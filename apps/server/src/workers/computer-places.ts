import {
    type WorkerRuntime,
    type WorkerRuntimeReadiness,
    workerRuntimeReadinessSchema,
    workerRuntimes,
} from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export interface ComputerPlace {
    attachedByUserId: string;
    computerId: string;
    limit: number;
    name: string | null;
    online: boolean;
    runtimes: WorkerRuntimeReadiness[];
    workersEnabled: boolean;
}

export async function readComputerPlaces(
    db: Reader,
    serverId: string,
    computerIds?: readonly string[]
) {
    const rows = await db
        .select({
            attachedByUserId: computersTable.attachedByUserId,
            computerId: computersTable.id,
            health: computersTable.health,
            inventory: computersTable.reportedInventory,
            limit: computersTable.workerLimit,
            workersEnabled: computersTable.workersEnabled,
        })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, serverId),
                computerIds ? inArray(computersTable.id, [...computerIds]) : undefined
            )
        )
        .orderBy(asc(computersTable.createdAt), asc(computersTable.id));
    return rows.map(
        (row) =>
            ({
                attachedByUserId: row.attachedByUserId,
                computerId: row.computerId,
                limit: row.limit,
                name: row.inventory?.name ?? null,
                online: row.health === 'healthy' || row.health === 'degraded',
                runtimes: (row.inventory?.workerRuntimes ?? []).flatMap((reported) => {
                    const parsed = workerRuntimeReadinessSchema.safeParse(reported);
                    return parsed.success ? [parsed.data] : [];
                }),
                workersEnabled: row.workersEnabled,
            }) satisfies ComputerPlace
    );
}

export async function readComputerPlace(db: Reader, serverId: string, computerId: string) {
    const [place] = await readComputerPlaces(db, serverId, [computerId]);
    return place ?? null;
}

export function readyRuntimeOf(place: ComputerPlace, requested: WorkerRuntime | null) {
    const ready = new Set(place.runtimes.filter((reading) => reading.ready).map((r) => r.runtime));
    if (requested) {
        return ready.has(requested) ? requested : null;
    }
    return workerRuntimes.find((runtime) => ready.has(runtime)) ?? null;
}

export function isComputerPlaceUsable(place: ComputerPlace) {
    return place.workersEnabled && place.online && readyRuntimeOf(place, null) !== null;
}

export function computerPlaceLabel(place: Pick<ComputerPlace, 'computerId' | 'name'>) {
    return place.name ?? `computer:${place.computerId}`;
}
