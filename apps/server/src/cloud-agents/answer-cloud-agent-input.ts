import { isDeepStrictEqual } from 'node:util';
import type { CloudAgentCallback, CloudAgentInputAnswers } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    cloudAgentContinuationsTable,
    cloudAgentInputTable,
    cloudAgentPromptsTable,
    cloudAgentRunsTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { prepareCloudAgentWorkEvents } from './cloud-agent-events.ts';
import {
    type CloudAgentCallbackScope,
    CloudAgentInputError,
    listCloudAgentInput,
    readCloudAgentInput,
    requireLiveCloudRun,
    requireOwnedCloudRun,
} from './cloud-agent-input-store.ts';
import { projectNativeCloudAgentRun } from './project-native-cloud-agent-run.ts';

export async function answerCloudAgentInput(
    db: HausDatabase,
    runner: ResolvedRunner,
    id: string,
    answer: CloudAgentInputAnswers
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const current = await readCloudAgentInput(tx, runner.serverId, id);
        await requireOwnedCloudRun(tx, runner, current.workId, current.runId);
        const questions = current.questions.map((question) => question.question);
        if (
            Object.keys(answer).length !== questions.length ||
            questions.some((question) => !answer[question])
        ) {
            throw new CloudAgentInputError('Answer every original question exactly once.');
        }
        if (current.state === 'answered' && isDeepStrictEqual(current.answer, answer)) {
            return current;
        }
        if (current.state !== 'pending') {
            throw new CloudAgentInputError(
                'This input request is stale or has a different answer.'
            );
        }
        await tx
            .update(cloudAgentInputTable)
            .set({ answer, state: 'answered' })
            .where(eq(cloudAgentInputTable.id, id));
        await tx
            .insert(cloudAgentContinuationsTable)
            .values({ requestId: id })
            .onConflictDoNothing();
        return await readCloudAgentInput(tx, runner.serverId, id);
    });
}

export async function consumeCloudAgentInput(
    db: HausDatabase,
    scope: CloudAgentCallbackScope,
    input: Extract<CloudAgentCallback, { kind: 'consume' }>
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, scope.serverId);
        const current = await readCloudAgentInput(tx, scope.serverId, input.id);
        if (
            current.runId !== scope.runId ||
            current.sessionId !== input.sessionId ||
            !isDeepStrictEqual(current.answer, input.answer)
        ) {
            throw new CloudAgentInputError(
                'Native consumption does not match the original request and answer.'
            );
        }
        if (current.state === 'resolved') {
            if (
                current.resumedPromptId !== input.promptId ||
                current.resumedToolUseId !== input.toolUseId
            ) {
                throw new CloudAgentInputError('Conflicting native consumption receipt.');
            }
            return { request: current, events: [] };
        }
        await requireLiveCloudRun(tx, scope);
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
        if (
            current.state !== 'answered' ||
            !prompt ||
            prompt.sessionId !== input.sessionId ||
            (prompt.requestId !== input.id && current.promptId !== input.promptId) ||
            (prompt.requestId === input.id
                ? prompt.toolUseId !== input.toolUseId
                : current.toolUseId !== input.toolUseId)
        ) {
            throw new CloudAgentInputError('No accepted continuation can consume this answer.');
        }
        await tx
            .update(cloudAgentInputTable)
            .set({
                state: 'resolved',
                resumedPromptId: input.promptId,
                resumedToolUseId: input.toolUseId,
            })
            .where(eq(cloudAgentInputTable.id, input.id));
        const pending = await listCloudAgentInput(tx, scope.serverId, scope.workId);
        if (!pending.some((request) => request.runId === scope.runId)) {
            const now = new Date();
            await tx
                .update(cloudAgentRunsTable)
                .set({ status: 'running', observedAt: now })
                .where(eq(cloudAgentRunsTable.id, scope.runId));
            await projectNativeCloudAgentRun(tx, scope, { status: 'running', updatedAt: now });
        }
        return {
            request: await readCloudAgentInput(tx, scope.serverId, input.id),
            events: await prepareCloudAgentWorkEvents(tx, {
                serverId: scope.serverId,
                workId: scope.workId,
            }),
        };
    });
}
