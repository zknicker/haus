import { and, desc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    cloudAgentContinuationsTable,
    cloudAgentPromptsTable,
    cloudAgentRunsTable,
    cloudAgentWorkTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { requireCloudAgentComputer } from './cloud-agent-bootstrap.ts';
import {
    CloudAgentInputError,
    listCloudAgentInput,
    readCloudAgentInput,
    requireLiveCloudRun,
} from './cloud-agent-input-store.ts';
import { findCloudAgentWork, toCloudAgentRun } from './cloud-agent-shape.ts';

export async function readCloudAgentComputerWork(
    db: HausDatabase,
    input: { credentialHash: string; workId: string; runId?: string }
) {
    const computer = await requireCloudAgentComputer(db, input.credentialHash);
    const work = await findCloudAgentWork(db, computer.serverId, input.workId);
    if (!work || work.computerId !== computer.computerId || work.provider !== 'claude') {
        throw new CloudAgentInputError('That Claude work belongs to another Computer.');
    }
    let run = input.runId ? work.runs.find((entry) => entry.runId === input.runId) : work.runs[0];
    if (!run && input.runId) {
        const [row] = await db
            .select()
            .from(cloudAgentRunsTable)
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, computer.serverId),
                    eq(cloudAgentRunsTable.workId, work.id),
                    eq(cloudAgentRunsTable.id, input.runId)
                )
            )
            .limit(1);
        if (row) {
            run = toCloudAgentRun(row);
        }
    }
    if (!run) {
        throw new CloudAgentInputError('Unknown Cloud Agent execution.');
    }
    const requests = (await listCloudAgentInput(db, computer.serverId, work.id)).filter(
        (entry) => entry.runId === run.runId
    );
    const prompts = await db
        .select({
            promptId: cloudAgentPromptsTable.promptId,
            sessionId: cloudAgentPromptsTable.sessionId,
            requestId: cloudAgentPromptsTable.requestId,
        })
        .from(cloudAgentPromptsTable)
        .where(eq(cloudAgentPromptsTable.runId, run.runId))
        .orderBy(desc(cloudAgentPromptsTable.createdAt));
    const continuations: Array<{
        requestId: string;
        state: 'queued' | 'sending' | 'accepted';
        attemptedAt: string | null;
    }> = [];
    for (const request of requests) {
        const [continuation] = await db
            .select()
            .from(cloudAgentContinuationsTable)
            .where(eq(cloudAgentContinuationsTable.requestId, request.id))
            .limit(1);
        if (continuation) {
            continuations.push({
                requestId: continuation.requestId,
                state: continuation.state,
                attemptedAt: continuation.attemptedAt?.toISOString() ?? null,
            });
        }
    }
    const [latest] = await db
        .select({ stopEvidence: cloudAgentPromptsTable.stopEvidence })
        .from(cloudAgentPromptsTable)
        .where(eq(cloudAgentPromptsTable.runId, run.runId))
        .orderBy(desc(cloudAgentPromptsTable.createdAt))
        .limit(1);
    const liveRuns = await db
        .select({
            id: cloudAgentRunsTable.id,
            status: cloudAgentRunsTable.status,
            providerRunId: cloudAgentRunsTable.providerRunId,
        })
        .from(cloudAgentRunsTable)
        .where(
            and(
                eq(cloudAgentRunsTable.serverId, computer.serverId),
                eq(cloudAgentRunsTable.workId, work.id),
                inArray(cloudAgentRunsTable.status, ['queued', 'running', 'pending_input'])
            )
        )
        .orderBy(desc(cloudAgentRunsTable.createdAt));
    const active = liveRuns.find(
        (entry) => entry.providerRunId !== null && entry.status !== 'queued'
    );
    return {
        work,
        run,
        requests,
        prompts,
        continuations,
        stopEvidence: latest?.stopEvidence ?? null,
        cancellation: {
            runIds: liveRuns.map((entry) => entry.id),
            activeRunId: active?.id ?? null,
        },
    };
}
export async function claimCloudAgentContinuation(
    db: HausDatabase,
    input: { credentialHash: string; requestId: string }
) {
    const computer = await requireCloudAgentComputer(db, input.credentialHash);
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, computer.serverId);
        const request = await readCloudAgentInput(tx, computer.serverId, input.requestId);
        const [work] = await tx
            .select()
            .from(cloudAgentWorkTable)
            .where(eq(cloudAgentWorkTable.id, request.workId))
            .limit(1);
        if (!work || work.computerId !== computer.computerId || request.state !== 'answered') {
            throw new CloudAgentInputError('This Computer cannot continue that input request.');
        }
        await requireLiveCloudRun(tx, {
            serverId: computer.serverId,
            workId: work.id,
            runId: request.runId,
        });
        const [continuation] = await tx
            .select()
            .from(cloudAgentContinuationsTable)
            .where(eq(cloudAgentContinuationsTable.requestId, request.id))
            .limit(1);
        if (!continuation || continuation.state !== 'queued') {
            return { claimed: false };
        }
        if (!work.providerAgentId) {
            throw new CloudAgentInputError('The hosted Claude session is not confirmed yet.');
        }
        await tx
            .update(cloudAgentContinuationsTable)
            .set({ state: 'sending', attemptedAt: new Date() })
            .where(eq(cloudAgentContinuationsTable.requestId, request.id));
        return {
            claimed: true,
            requestId: request.id,
            runId: request.runId,
            workId: work.id,
            providerAgentId: work.providerAgentId,
        };
    });
}
