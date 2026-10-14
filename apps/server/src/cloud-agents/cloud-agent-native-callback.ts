import type { CloudAgentCallback } from '@haus/api';
import { and, desc, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    cloudAgentCallbacksTable,
    cloudAgentContinuationsTable,
    cloudAgentInputTable,
    cloudAgentPromptsTable,
    cloudAgentRunsTable,
    cloudAgentWorkTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { prepareCloudAgentWorkEvents } from './cloud-agent-events.ts';
import {
    type CloudAgentCallbackScope,
    CloudAgentInputError,
    cloudAgentCallbackTokenHash,
    listCloudAgentInput,
    readCloudAgentInput,
    requireLiveCloudRun,
    requireOwnedCloudRun,
} from './cloud-agent-input-store.ts';
import { isCloudAgentRequestChatLive } from './cloud-agent-request-chat.ts';
import {
    isNativeCloudAgentPaused,
    recordNativeCloudAgentStopEvidence,
} from './native-cloud-agent-stop-evidence.ts';
import { projectNativeCloudAgentRun } from './project-native-cloud-agent-run.ts';

export async function registerCloudAgentCallbackCredential(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { workId: string; runId: string; token: string }
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const work = await requireOwnedCloudRun(tx, runner, input.workId, input.runId);
        if (work.provider !== 'claude') {
            throw new CloudAgentInputError(
                'Native callback credentials belong to Claude Cloud executions.'
            );
        }
        const hash = cloudAgentCallbackTokenHash(input.token);
        const [existing] = await tx
            .select()
            .from(cloudAgentCallbacksTable)
            .where(eq(cloudAgentCallbacksTable.runId, input.runId))
            .limit(1);
        if (existing && existing.tokenHash !== hash) {
            throw new CloudAgentInputError(
                'This execution already has a different callback credential.'
            );
        }
        if (!existing) {
            await tx
                .insert(cloudAgentCallbacksTable)
                .values({ runId: input.runId, serverId: runner.serverId, tokenHash: hash });
        }
    });
}

export async function acceptCloudAgentPrompt(
    db: HausDatabase,
    scope: CloudAgentCallbackScope,
    input: Extract<CloudAgentCallback, { kind: 'prompt' }>
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, scope.serverId);
        const [credential] = await tx
            .select()
            .from(cloudAgentCallbacksTable)
            .where(eq(cloudAgentCallbacksTable.runId, scope.runId))
            .limit(1);
        validateNativeSession(credential, scope.tokenHash, input.sessionId);
        const [existing] = await tx
            .select()
            .from(cloudAgentPromptsTable)
            .where(eq(cloudAgentPromptsTable.promptId, input.promptId))
            .limit(1);
        if (existing) {
            if (
                existing.runId !== scope.runId ||
                existing.sessionId !== input.sessionId ||
                existing.requestId !== (input.requestId ?? null)
            ) {
                throw new CloudAgentInputError('Conflicting native prompt receipt.');
            }
            return {
                request: input.requestId
                    ? await readCloudAgentInput(tx, scope.serverId, input.requestId)
                    : null,
                events: [],
            };
        }
        await requireLiveCloudRun(tx, scope);
        const request = input.requestId
            ? await readCloudAgentInput(tx, scope.serverId, input.requestId)
            : null;
        requireValidContinuation(request, scope.runId, input.sessionId);
        await tx.insert(cloudAgentPromptsTable).values({
            serverId: scope.serverId,
            runId: scope.runId,
            sessionId: input.sessionId,
            promptId: input.promptId,
            requestId: input.requestId ?? null,
        });
        if (input.requestId) {
            await tx
                .update(cloudAgentContinuationsTable)
                .set({ state: 'accepted' })
                .where(eq(cloudAgentContinuationsTable.requestId, input.requestId));
        }
        await tx
            .update(cloudAgentCallbacksTable)
            .set({ sessionId: input.sessionId })
            .where(eq(cloudAgentCallbacksTable.runId, scope.runId));
        const [run] = await tx
            .select()
            .from(cloudAgentRunsTable)
            .where(eq(cloudAgentRunsTable.id, scope.runId))
            .limit(1);
        const now = new Date();
        if (!run?.providerRunId) {
            await tx
                .update(cloudAgentRunsTable)
                .set({
                    providerRunId: input.promptId,
                    status: 'running',
                    startedAt: now,
                    observedAt: now,
                })
                .where(eq(cloudAgentRunsTable.id, scope.runId));
            await projectNativeCloudAgentRun(tx, scope, {
                status: 'running',
                startedAt: now,
                updatedAt: now,
            });
        }
        return {
            request,
            events: await prepareCloudAgentWorkEvents(tx, {
                serverId: scope.serverId,
                workId: scope.workId,
            }),
        };
    });
}

function validateNativeSession(
    credential: typeof cloudAgentCallbacksTable.$inferSelect | undefined,
    tokenHash: string,
    sessionId: string
) {
    if (
        !credential ||
        credential.tokenHash !== tokenHash ||
        (credential.sessionId !== null && credential.sessionId !== sessionId)
    ) {
        throw new CloudAgentInputError('The native runtime session changed.');
    }
}

function requireValidContinuation(
    request: Awaited<ReturnType<typeof readCloudAgentInput>> | null,
    runId: string,
    sessionId: string
) {
    if (
        request &&
        (request.runId !== runId || request.sessionId !== sessionId || request.state !== 'answered')
    ) {
        throw new CloudAgentInputError(
            'The continuation request is stale or belongs to another execution.'
        );
    }
}

export async function settleCloudAgentNativePrompt(
    db: HausDatabase,
    scope: CloudAgentCallbackScope,
    input: Extract<CloudAgentCallback, { kind: 'stop' | 'failure' }>,
    delivery: AgentDelivery
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, scope.serverId);
        const [prompt] = await tx
            .select()
            .from(cloudAgentPromptsTable)
            .where(
                and(
                    eq(cloudAgentPromptsTable.runId, scope.runId),
                    eq(cloudAgentPromptsTable.promptId, input.promptId)
                )
            )
            .limit(1);
        if (!prompt || prompt.sessionId !== input.sessionId) {
            throw new CloudAgentInputError('The outcome belongs to an unknown native prompt.');
        }
        const [latestPrompt] = await tx
            .select({ promptId: cloudAgentPromptsTable.promptId })
            .from(cloudAgentPromptsTable)
            .where(eq(cloudAgentPromptsTable.runId, scope.runId))
            .orderBy(desc(cloudAgentPromptsTable.createdAt))
            .limit(1);
        if (latestPrompt?.promptId !== input.promptId) {
            return { settled: false, events: [], wake: null };
        }
        await recordNativeCloudAgentStopEvidence(tx, scope, input);
        const [run] = await tx
            .select()
            .from(cloudAgentRunsTable)
            .where(eq(cloudAgentRunsTable.id, scope.runId))
            .limit(1);
        if (run?.terminalAt) {
            return { settled: true, events: [], wake: null };
        }
        const [work] = await tx
            .select({ cancelRequestedAt: cloudAgentWorkTable.cancelRequestedAt })
            .from(cloudAgentWorkTable)
            .where(eq(cloudAgentWorkTable.id, scope.workId))
            .limit(1);
        if (work?.cancelRequestedAt) {
            return { settled: false, events: [], wake: null };
        }
        const pending = await listCloudAgentInput(tx, scope.serverId, scope.workId);
        if (isNativeCloudAgentPaused(input, pending, scope.runId)) {
            return { settled: false, events: [], wake: null };
        }
        await requireLiveCloudRun(tx, scope);
        const now = new Date();
        const status = input.kind === 'failure' ? 'failed' : 'completed';
        await tx
            .update(cloudAgentRunsTable)
            .set({
                status,
                terminalAt: now,
                observedAt: now,
                summary:
                    (input.kind === 'failure' ? input.message : input.lastAssistantMessage) || null,
            })
            .where(eq(cloudAgentRunsTable.id, scope.runId));
        await projectNativeCloudAgentRun(tx, scope, { status, terminalAt: now, updatedAt: now });
        if (input.kind === 'failure') {
            await tx
                .update(cloudAgentInputTable)
                .set({ state: 'cancelled' })
                .where(
                    and(
                        eq(cloudAgentInputTable.runId, scope.runId),
                        eq(cloudAgentInputTable.state, 'pending')
                    )
                );
            await tx
                .update(cloudAgentInputTable)
                .set({ state: 'cancelled' })
                .where(
                    and(
                        eq(cloudAgentInputTable.runId, scope.runId),
                        eq(cloudAgentInputTable.state, 'answered')
                    )
                );
        }
        const wake = await notifyNativeCompletion(tx, scope, delivery);
        return {
            settled: true,
            events: await prepareCloudAgentWorkEvents(tx, {
                serverId: scope.serverId,
                workId: scope.workId,
            }),
            wake,
        };
    });
}

async function notifyNativeCompletion(
    db: HausDatabase,
    scope: CloudAgentCallbackScope,
    delivery: AgentDelivery
) {
    if (
        !(await isCloudAgentRequestChatLive(db, { serverId: scope.serverId, chatId: scope.chatId }))
    ) {
        return null;
    }
    await delivery.enqueue(db, {
        serverId: scope.serverId,
        agentId: scope.agentId,
        chatId: scope.chatId,
        content: '',
        source: 'cloud_agent_work',
        dedupeKey: scope.runId,
    });
    return { serverId: scope.serverId, agentId: scope.agentId };
}
