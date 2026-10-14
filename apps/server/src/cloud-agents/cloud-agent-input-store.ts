import { createHash } from 'node:crypto';
import {
    type CloudAgentInputRequest,
    cloudAgentInputRequestSchema,
    isTerminalCloudAgentStatus,
} from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    cloudAgentCallbacksTable,
    cloudAgentInputTable,
    cloudAgentRunsTable,
    cloudAgentWorkTable,
} from '../postgres/schema.ts';

export class CloudAgentInputError extends Error {
    override readonly name = 'CloudAgentInputError';
}
export interface CloudAgentCallbackScope {
    agentId: string;
    chatId: string;
    computerId: string;
    runId: string;
    serverId: string;
    sessionId: string | null;
    tokenHash: string;
    workId: string;
}
export function cloudAgentCallbackTokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
}
export async function authorizeCloudAgentCallback(
    db: HausDatabase,
    token: string
): Promise<CloudAgentCallbackScope | null> {
    const [row] = await db
        .select({
            serverId: cloudAgentWorkTable.serverId,
            workId: cloudAgentWorkTable.id,
            agentId: cloudAgentWorkTable.agentId,
            chatId: cloudAgentWorkTable.chatId,
            computerId: cloudAgentWorkTable.computerId,
            runId: cloudAgentCallbacksTable.runId,
            tokenHash: cloudAgentCallbacksTable.tokenHash,
            sessionId: cloudAgentCallbacksTable.sessionId,
        })
        .from(cloudAgentCallbacksTable)
        .innerJoin(
            cloudAgentRunsTable,
            and(
                eq(cloudAgentRunsTable.serverId, cloudAgentCallbacksTable.serverId),
                eq(cloudAgentRunsTable.id, cloudAgentCallbacksTable.runId)
            )
        )
        .innerJoin(
            cloudAgentWorkTable,
            and(
                eq(cloudAgentWorkTable.serverId, cloudAgentRunsTable.serverId),
                eq(cloudAgentWorkTable.id, cloudAgentRunsTable.workId)
            )
        )
        .where(eq(cloudAgentCallbacksTable.tokenHash, cloudAgentCallbackTokenHash(token)))
        .limit(1);
    return row ?? null;
}
export async function requireLiveCloudRun(
    db: HausDatabase,
    scope: Pick<CloudAgentCallbackScope, 'serverId' | 'runId' | 'workId'>
) {
    const [row] = await db
        .select({
            status: cloudAgentRunsTable.status,
            cancelRequestedAt: cloudAgentWorkTable.cancelRequestedAt,
        })
        .from(cloudAgentRunsTable)
        .innerJoin(
            cloudAgentWorkTable,
            and(
                eq(cloudAgentWorkTable.serverId, cloudAgentRunsTable.serverId),
                eq(cloudAgentWorkTable.id, cloudAgentRunsTable.workId)
            )
        )
        .where(
            and(
                eq(cloudAgentRunsTable.serverId, scope.serverId),
                eq(cloudAgentRunsTable.id, scope.runId),
                eq(cloudAgentRunsTable.workId, scope.workId)
            )
        )
        .limit(1);
    if (!row || isTerminalCloudAgentStatus(row.status) || row.cancelRequestedAt) {
        throw new CloudAgentInputError('This Cloud Agent execution is no longer accepting input.');
    }
    return row;
}
export async function requireOwnedCloudRun(
    db: HausDatabase,
    runner: ResolvedRunner,
    workId: string,
    runId?: string
) {
    const [work] = await db
        .select()
        .from(cloudAgentWorkTable)
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, runner.serverId),
                eq(cloudAgentWorkTable.id, workId),
                eq(cloudAgentWorkTable.agentId, runner.agentId)
            )
        )
        .limit(1);
    if (!work) {
        throw new CloudAgentInputError('Cloud Agent work is unavailable to this Agent.');
    }
    if (runId) {
        await requireLiveCloudRun(db, { serverId: runner.serverId, runId, workId });
    }
    return work;
}
export async function readCloudAgentInput(
    db: HausDatabase,
    serverId: string,
    id: string
): Promise<CloudAgentInputRequest> {
    const [row] = await db
        .select({ input: cloudAgentInputTable, workId: cloudAgentRunsTable.workId })
        .from(cloudAgentInputTable)
        .innerJoin(
            cloudAgentRunsTable,
            and(
                eq(cloudAgentRunsTable.serverId, cloudAgentInputTable.serverId),
                eq(cloudAgentRunsTable.id, cloudAgentInputTable.runId)
            )
        )
        .where(and(eq(cloudAgentInputTable.serverId, serverId), eq(cloudAgentInputTable.id, id)))
        .limit(1);
    if (!row) {
        throw new CloudAgentInputError('Unknown Cloud Agent input request.');
    }
    const { serverId: _serverId, ...input } = row.input;
    return cloudAgentInputRequestSchema.parse({
        ...input,
        workId: row.workId,
        createdAt: row.input.createdAt.toISOString(),
    });
}
export async function listCloudAgentInput(db: HausDatabase, serverId: string, workId: string) {
    const rows = await db
        .select({ id: cloudAgentInputTable.id })
        .from(cloudAgentInputTable)
        .innerJoin(
            cloudAgentRunsTable,
            and(
                eq(cloudAgentRunsTable.serverId, cloudAgentInputTable.serverId),
                eq(cloudAgentRunsTable.id, cloudAgentInputTable.runId)
            )
        )
        .where(
            and(
                eq(cloudAgentInputTable.serverId, serverId),
                eq(cloudAgentRunsTable.workId, workId),
                inArray(cloudAgentInputTable.state, ['pending', 'answered'])
            )
        );
    const requests: CloudAgentInputRequest[] = [];
    for (const row of rows) {
        requests.push(await readCloudAgentInput(db, serverId, row.id));
    }
    return requests;
}
