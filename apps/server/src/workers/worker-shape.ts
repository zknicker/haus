import {
    type PullRequestReading,
    type Worker,
    type WorkerTurn,
    deriveWorkerJob,
    workerSchema,
    workerStatusOf,
    workerTurnSchema,
    workerTurnsRetained,
} from '@haus/api';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import {
    pullRequestKey,
    readPullRequestReadings,
    reportedPullRequests,
} from './pull-request-readings.ts';
import { readPlaceComputerNames, workerPlaceViewOf } from './worker-row-place.ts';

type WorkerRow = typeof workersTable.$inferSelect;
type TurnRow = typeof workerTurnsTable.$inferSelect;
type WorkerReader = Pick<HausDatabase, 'select'>;

export interface WorkerDetails {
    computerName: string | null;
    pullRequests: PullRequestReading[];
    turns: TurnRow[];
}

const noDetails: WorkerDetails = { computerName: null, pullRequests: [], turns: [] };

export function toWorkerTurn(row: TurnRow): WorkerTurn {
    return workerTurnSchema.parse({
        acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
        branches: row.branches,
        createdAt: row.createdAt.toISOString(),
        dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
        errorCode: row.errorCode,
        input: row.input,
        model: {
            droppedParams: row.modelDroppedParams,
            fallbackFrom: row.modelFallbackFrom,
            id: row.modelId,
            params: row.modelParams,
        },
        outcome: row.outcome,
        providerRunId: row.providerRunId,
        rawStatus: row.rawStatus,
        report: row.providerResult ?? null,
        stall:
            row.stallCode && row.stallSince
                ? { code: row.stallCode, since: row.stallSince.toISOString() }
                : null,
        startedAt: row.startedAt?.toISOString() ?? null,
        status: row.status,
        ...(row.steps ? { steps: row.steps } : {}),
        stopRequestedAt: row.stopRequestedAt?.toISOString() ?? null,
        stopRequestedBy: stopRequestedByOf(row),
        summary: row.summary,
        terminalAt: row.terminalAt?.toISOString() ?? null,
        turnId: row.id,
        usage: row.usage ?? null,
    });
}

/** `turns` is newest first and bounded; the Worker keeps recent turns, not history. */
export function toWorker(row: WorkerRow, details: WorkerDetails = noDetails): Worker {
    const recent = details.turns.slice(0, workerTurnsRetained).map(toWorkerTurn);
    const [newest] = details.turns;
    const startedAt = row.startedAt?.toISOString() ?? null;
    const terminalAt = row.terminalAt?.toISOString() ?? null;
    return workerSchema.parse({
        activity:
            row.activitySummary && row.activityAt
                ? { at: row.activityAt.toISOString(), summary: row.activitySummary }
                : null,
        agentId: row.agentId,
        branch: row.branch,
        carrierComputerId: row.carrierComputerId,
        closedAt: row.closedAt?.toISOString() ?? null,
        closingAt: row.closingAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        environmentId: row.environmentId,
        environmentName: row.environmentName,
        id: row.id,
        job: deriveWorkerJob({ startedAt, status: row.status, terminalAt, turns: recent }),
        keptWorktree: row.keptWorktreePath,
        launchMessageId: row.launchMessageId,
        model: row.model,
        originChatId: row.originChatId,
        place: workerPlaceViewOf(row, details.computerName),
        providerAgentId: row.providerAgentId,
        providerUrl: row.providerUrl,
        pullRequests: details.pullRequests,
        repository: row.repository,
        runtime: row.runtime,
        startedAt,
        startingRef: row.startingRef,
        status: workerStatusOf(newest ?? { outcome: null, status: row.status }),
        taskId: row.taskId,
        terminalAt,
        title: row.title,
        turns: recent,
        updatedAt: row.updatedAt.toISOString(),
        workerMdRevisionId: row.workerMdRevisionId,
    });
}

export async function findWorker(
    db: WorkerReader,
    serverId: string,
    workerId: string
): Promise<Worker | null> {
    const [row] = await db
        .select()
        .from(workersTable)
        .where(and(eq(workersTable.serverId, serverId), eq(workersTable.id, workerId)))
        .limit(1);
    if (!row) {
        return null;
    }
    const details = await readWorkerDetails(db, serverId, [workerId]);
    return toWorker(row, details.get(workerId));
}

export async function requireWorker(db: WorkerReader, serverId: string, workerId: string) {
    const worker = await findWorker(db, serverId, workerId);
    if (!worker) {
        throw new Error(`Worker ${workerId} could not be projected.`);
    }
    return worker;
}

/** Everything a Worker projects beyond its own row, for each of `workerIds`. */
export async function readWorkerDetails(
    db: WorkerReader,
    serverId: string,
    workerIds: string[]
): Promise<Map<string, WorkerDetails>> {
    const turnsByWorker = await readTurns(db, serverId, workerIds);
    const keysByWorker = new Map(
        [...turnsByWorker].map(([workerId, turns]) => [workerId, reportedPullRequests(turns)])
    );
    const readings = await readPullRequestReadings(db, serverId, [...keysByWorker.values()].flat());
    const computerNames = await readPlaceComputerNames(db, serverId, workerIds);
    return new Map(
        [...turnsByWorker].map(([workerId, turns]) => {
            const pullRequests = (keysByWorker.get(workerId) ?? []).flatMap((key) => {
                const reading = readings.get(pullRequestKey(key));
                return reading ? [reading] : [];
            });
            return [
                workerId,
                { computerName: computerNames.get(workerId) ?? null, pullRequests, turns },
            ];
        })
    );
}

async function readTurns(
    db: WorkerReader,
    serverId: string,
    workerIds: string[]
): Promise<Map<string, TurnRow[]>> {
    const byWorker = new Map<string, TurnRow[]>();
    if (workerIds.length === 0) {
        return byWorker;
    }
    const rows = await db
        .select()
        .from(workerTurnsTable)
        .where(
            and(
                eq(workerTurnsTable.serverId, serverId),
                inArray(workerTurnsTable.workerId, workerIds)
            )
        )
        .orderBy(desc(workerTurnsTable.createdAt), desc(workerTurnsTable.id));
    for (const row of rows) {
        byWorker.set(row.workerId, [...(byWorker.get(row.workerId) ?? []), row]);
    }
    return byWorker;
}

function stopRequestedByOf(row: TurnRow): WorkerTurn['stopRequestedBy'] {
    if (row.stopRequestedByUserId) {
        return { id: row.stopRequestedByUserId, kind: 'user' };
    }
    if (row.stopRequestedByAgentId) {
        return { id: row.stopRequestedByAgentId, kind: 'agent' };
    }
    return null;
}
