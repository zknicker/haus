import { type WorkerAttention, workerAttentionSchema } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { workerPlaceOf } from './worker-row-place.ts';

/** What a Run contributes to an attention; the inbox row supplies its `notice`. */
export type WorkerTurnAttention = Omit<WorkerAttention, 'notice'>;

const runAttentionSchema = workerAttentionSchema.omit({ notice: true });

/**
 * The attention one Worker Run hands its delegating Agent: the outcome it
 * needs to inspect the work and post results as ordinary Messages, keyed by the
 * Run id the inbox row carries.
 */
export async function readWorkerAttentions(
    db: HausDatabase,
    serverId: string,
    turnIds: string[]
): Promise<Map<string, WorkerTurnAttention>> {
    const rows = await db
        .select({
            branches: workerTurnsTable.branches,
            carrierComputerId: workersTable.carrierComputerId,
            errorCode: workerTurnsTable.errorCode,
            place: workersTable.place,
            providerUrl: workersTable.providerUrl,
            report: workerTurnsTable.providerResult,
            repository: workersTable.repository,
            turnId: workerTurnsTable.id,
            stallCode: workerTurnsTable.stallCode,
            status: workerTurnsTable.status,
            summary: workerTurnsTable.summary,
            title: workersTable.title,
            workerId: workersTable.id,
        })
        .from(workerTurnsTable)
        .innerJoin(
            workersTable,
            and(
                eq(workersTable.serverId, workerTurnsTable.serverId),
                eq(workersTable.id, workerTurnsTable.workerId)
            )
        )
        .where(and(eq(workerTurnsTable.serverId, serverId), inArray(workerTurnsTable.id, turnIds)));
    return new Map(
        rows.map((row) => {
            const { carrierComputerId, place, report, ...attention } = row;
            // `summary` is a capped head of `report.text` (TECH-8); a reader needs
            // the pointer whenever the full report outgrew that head.
            const hasFullReport =
                report !== null && report.text.length > (row.summary?.length ?? 0);
            return [
                row.turnId,
                runAttentionSchema.parse({
                    ...attention,
                    hasFullReport,
                    place: workerPlaceOf({ carrierComputerId, place }),
                }),
            ];
        })
    );
}
