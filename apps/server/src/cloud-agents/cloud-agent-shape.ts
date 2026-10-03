import {
    type CloudAgentRun,
    type CloudAgentWork,
    cloudAgentRunSchema,
    cloudAgentRunsRetained,
    cloudAgentWorkSchema,
} from '@haus/api';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';

type WorkRow = typeof cloudAgentWorkTable.$inferSelect;
type RunRow = typeof cloudAgentRunsTable.$inferSelect;
type CloudAgentReader = Pick<HausDatabase, 'select'>;

export function toCloudAgentRun(row: RunRow): CloudAgentRun {
    return cloudAgentRunSchema.parse({
        branches: row.branches,
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
export function toCloudAgentWork(row: WorkRow, runs: RunRow[]): CloudAgentWork {
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
        id: row.id,
        messageId: row.messageId,
        provider: row.provider,
        providerAgentId: row.providerAgentId,
        providerUrl: row.providerUrl,
        repository: row.repository,
        runs: runs.slice(0, cloudAgentRunsRetained).map(toCloudAgentRun),
        startedAt: row.startedAt?.toISOString() ?? null,
        startingRef: row.startingRef,
        status: row.status,
        terminalAt: row.terminalAt?.toISOString() ?? null,
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
    const runs = await readRuns(db, serverId, [workId]);
    return toCloudAgentWork(row, runs.get(workId) ?? []);
}

export async function findCloudAgentWorkByMessage(
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
                eq(cloudAgentWorkTable.messageId, messageId)
            )
        )
        .limit(1);
    if (!row) {
        return null;
    }
    const runs = await readRuns(db, serverId, [row.id]);
    return toCloudAgentWork(row, runs.get(row.id) ?? []);
}

export async function readCloudAgentWorkForMessages(
    db: CloudAgentReader,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, CloudAgentWork>> {
    if (messageIds.length === 0) {
        return new Map();
    }
    const rows = await db
        .select()
        .from(cloudAgentWorkTable)
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, serverId),
                inArray(cloudAgentWorkTable.messageId, messageIds)
            )
        );
    const runs = await readRuns(
        db,
        serverId,
        rows.map((row) => row.id)
    );
    return new Map(
        rows.map((row) => [row.messageId, toCloudAgentWork(row, runs.get(row.id) ?? [])])
    );
}

export async function readRuns(
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
