import {
    type PullRequestReading,
    type WorkerTurn,
    type Worker,
    workerTurnSchema,
    workerTurnsRetained,
    workerSchema,
    deriveWorkerJob,
} from '@haus/api';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import {
    pullRequestKey,
    readPullRequestReadings,
    reportedPullRequest,
} from './pull-request-readings.ts';

type WorkRow = typeof workersTable.$inferSelect;
type RunRow = typeof workerTurnsTable.$inferSelect;
type WorkerReader = Pick<HausDatabase, 'select'>;

export interface WorkDetails {
    pullRequest: PullRequestReading | null;
    runs: RunRow[];
}

const noDetails: WorkDetails = { pullRequest: null, runs: [] };

export function toWorkerTurn(row: RunRow): WorkerTurn {
    return workerTurnSchema.parse({
        branches: row.branches,
        createdAt: row.createdAt.toISOString(),
        errorCode: row.errorCode,
        model: {
            droppedParams: row.modelDroppedParams,
            fallbackFrom: row.modelFallbackFrom,
            id: row.modelId,
            params: row.modelParams,
        },
        providerRunId: row.providerRunId,
        rawStatus: row.rawStatus,
        report: row.providerResult ?? null,
        turnId: row.id,
        stall:
            row.stallCode && row.stallSince
                ? { code: row.stallCode, since: row.stallSince.toISOString() }
                : null,
        startedAt: row.startedAt?.toISOString() ?? null,
        status: row.status,
        summary: row.summary,
        terminalAt: row.terminalAt?.toISOString() ?? null,
        usage: row.usage ?? null,
    });
}

/** `runs` is newest first and bounded; the work keeps recent Runs, not history. */
export function toWorker(row: WorkRow, details: WorkDetails = noDetails): Worker {
    const recent = details.runs.slice(0, workerTurnsRetained).map(toWorkerTurn);
    const [newest] = details.runs;
    const startedAt = row.startedAt?.toISOString() ?? null;
    const terminalAt = row.terminalAt?.toISOString() ?? null;
    return workerSchema.parse({
        activity:
            row.activitySummary && row.activityAt
                ? { at: row.activityAt.toISOString(), summary: row.activitySummary }
                : null,
        agentId: row.agentId,
        cancelRequestedAt: newest?.stopRequestedAt?.toISOString() ?? null,
        cancelRequestedBy: newest ? readCancelRequestedBy(newest) : null,
        chatId: row.originChatId,
        computerId: row.carrierComputerId,
        createdAt: row.createdAt.toISOString(),
        environmentId: row.environmentId,
        environmentName: row.environmentName,
        id: row.id,
        job: deriveWorkerJob({ turns: recent, startedAt, status: row.status, terminalAt }),
        messageId: row.launchMessageId,
        provider: row.place,
        providerAgentId: row.providerAgentId,
        providerUrl: row.providerUrl,
        pullRequest: details.pullRequest,
        repository: row.repository,
        turns: recent,
        startedAt,
        startingRef: row.startingRef,
        status: row.status,
        terminalAt,
        title: row.title,
        updatedAt: row.updatedAt.toISOString(),
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
    const details = await readWorkDetails(db, serverId, [workerId]);
    return toWorker(row, details.get(workerId));
}

export async function findWorkerByLaunchMessage(
    db: WorkerReader,
    serverId: string,
    messageId: string
): Promise<Worker | null> {
    const [row] = await db
        .select()
        .from(workersTable)
        .where(
            and(eq(workersTable.serverId, serverId), eq(workersTable.launchMessageId, messageId))
        )
        .limit(1);
    if (!row) {
        return null;
    }
    const details = await readWorkDetails(db, serverId, [row.id]);
    return toWorker(row, details.get(row.id));
}

/** Everything a work projects beyond its own row, for each of `workerIds`. */
export async function readWorkDetails(
    db: WorkerReader,
    serverId: string,
    workerIds: string[]
): Promise<Map<string, WorkDetails>> {
    const runsByWork = await readRuns(db, serverId, workerIds);
    const keyByWork = new Map(
        [...runsByWork].map(([workerId, runs]) => [workerId, reportedPullRequest(runs)])
    );
    const readings = await readPullRequestReadings(db, serverId, [...keyByWork.values()]);
    return new Map(
        [...runsByWork].map(([workerId, runs]) => {
            const key = keyByWork.get(workerId);
            const pullRequest = key ? (readings.get(pullRequestKey(key)) ?? null) : null;
            return [workerId, { pullRequest, runs }];
        })
    );
}

async function readRuns(
    db: WorkerReader,
    serverId: string,
    workerIds: string[]
): Promise<Map<string, RunRow[]>> {
    const byWork = new Map<string, RunRow[]>();
    if (workerIds.length === 0) {
        return byWork;
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
        .orderBy(desc(workerTurnsTable.createdAt));
    for (const row of rows) {
        byWork.set(row.workerId, [...(byWork.get(row.workerId) ?? []), row]);
    }
    return byWork;
}

function readCancelRequestedBy(row: RunRow): Worker['cancelRequestedBy'] {
    if (row.stopRequestedByUserId) {
        return { id: row.stopRequestedByUserId, kind: 'user' };
    }
    if (row.stopRequestedByAgentId) {
        return { id: row.stopRequestedByAgentId, kind: 'agent' };
    }
    return null;
}
