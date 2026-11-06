import {
    type CloudAgentPullRequestReading,
    type CloudAgentRun,
    type CloudAgentWork,
    cloudAgentRunSchema,
    cloudAgentRunsRetained,
    cloudAgentWorkSchema,
    deriveCloudAgentJob,
} from '@haus/api';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import {
    pullRequestKey,
    readPullRequestReadings,
    reportedPullRequest,
} from './pull-request-readings.ts';

type WorkRow = typeof cloudAgentWorkTable.$inferSelect;
type RunRow = typeof cloudAgentRunsTable.$inferSelect;
type CloudAgentReader = Pick<HausDatabase, 'select'>;

export interface WorkDetails {
    pullRequest: CloudAgentPullRequestReading | null;
    runs: RunRow[];
}

const noDetails: WorkDetails = { pullRequest: null, runs: [] };

export function toCloudAgentRun(row: RunRow): CloudAgentRun {
    return cloudAgentRunSchema.parse({
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
        runId: row.id,
        startedAt: row.startedAt?.toISOString() ?? null,
        status: row.status,
        summary: row.summary,
        terminalAt: row.terminalAt?.toISOString() ?? null,
        usage: row.usage ?? null,
    });
}

/** `runs` is newest first and bounded; the work keeps recent Runs, not history. */
export function toCloudAgentWork(row: WorkRow, details: WorkDetails = noDetails): CloudAgentWork {
    const recent = details.runs.slice(0, cloudAgentRunsRetained).map(toCloudAgentRun);
    const startedAt = row.startedAt?.toISOString() ?? null;
    const terminalAt = row.terminalAt?.toISOString() ?? null;
    return cloudAgentWorkSchema.parse({
        activity:
            row.activitySummary && row.activityAt
                ? { at: row.activityAt.toISOString(), summary: row.activitySummary }
                : null,
        agentId: row.agentId,
        cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
        cancelRequestedBy: readCancelRequestedBy(row),
        chatId: row.chatId,
        computerId: row.computerId,
        createdAt: row.createdAt.toISOString(),
        environmentId: row.environmentId,
        environmentName: row.environmentName,
        id: row.id,
        job: deriveCloudAgentJob({ runs: recent, startedAt, status: row.status, terminalAt }),
        messageId: row.launchMessageId,
        provider: row.provider,
        providerAgentId: row.providerAgentId,
        providerUrl: row.providerUrl,
        pullRequest: details.pullRequest,
        repository: row.repository,
        runs: recent,
        startedAt,
        startingRef: row.startingRef,
        status: row.status,
        terminalAt,
        title: row.title,
        updatedAt: row.updatedAt.toISOString(),
    });
}

export async function findCloudAgentWork(
    db: CloudAgentReader,
    serverId: string,
    workId: string
): Promise<CloudAgentWork | null> {
    const [row] = await db
        .select()
        .from(cloudAgentWorkTable)
        .where(and(eq(cloudAgentWorkTable.serverId, serverId), eq(cloudAgentWorkTable.id, workId)))
        .limit(1);
    if (!row) {
        return null;
    }
    const details = await readWorkDetails(db, serverId, [workId]);
    return toCloudAgentWork(row, details.get(workId));
}

export async function findCloudAgentWorkByLaunchMessage(
    db: CloudAgentReader,
    serverId: string,
    messageId: string
): Promise<CloudAgentWork | null> {
    const [row] = await db
        .select()
        .from(cloudAgentWorkTable)
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, serverId),
                eq(cloudAgentWorkTable.launchMessageId, messageId)
            )
        )
        .limit(1);
    if (!row) {
        return null;
    }
    const details = await readWorkDetails(db, serverId, [row.id]);
    return toCloudAgentWork(row, details.get(row.id));
}

/** Everything a work projects beyond its own row, for each of `workIds`. */
export async function readWorkDetails(
    db: CloudAgentReader,
    serverId: string,
    workIds: string[]
): Promise<Map<string, WorkDetails>> {
    const runsByWork = await readRuns(db, serverId, workIds);
    const keyByWork = new Map(
        [...runsByWork].map(([workId, runs]) => [workId, reportedPullRequest(runs)])
    );
    const readings = await readPullRequestReadings(db, serverId, [...keyByWork.values()]);
    return new Map(
        [...runsByWork].map(([workId, runs]) => {
            const key = keyByWork.get(workId);
            const pullRequest = key ? (readings.get(pullRequestKey(key)) ?? null) : null;
            return [workId, { pullRequest, runs }];
        })
    );
}

async function readRuns(
    db: CloudAgentReader,
    serverId: string,
    workIds: string[]
): Promise<Map<string, RunRow[]>> {
    const byWork = new Map<string, RunRow[]>();
    if (workIds.length === 0) {
        return byWork;
    }
    const rows = await db
        .select()
        .from(cloudAgentRunsTable)
        .where(
            and(
                eq(cloudAgentRunsTable.serverId, serverId),
                inArray(cloudAgentRunsTable.workId, workIds)
            )
        )
        .orderBy(desc(cloudAgentRunsTable.createdAt));
    for (const row of rows) {
        byWork.set(row.workId, [...(byWork.get(row.workId) ?? []), row]);
    }
    return byWork;
}

function readCancelRequestedBy(row: WorkRow): CloudAgentWork['cancelRequestedBy'] {
    if (row.cancelRequestedByUserId) {
        return { id: row.cancelRequestedByUserId, kind: 'user' };
    }
    if (row.cancelRequestedByAgentId) {
        return { id: row.cancelRequestedByAgentId, kind: 'agent' };
    }
    return null;
}
