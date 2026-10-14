import { isDeepStrictEqual } from 'node:util';
import type { CloudAgentCallback } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    cloudAgentInputTable,
    cloudAgentPromptsTable,
    cloudAgentRunsTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { prepareCloudAgentWorkEvents } from './cloud-agent-events.ts';
import {
    type CloudAgentCallbackScope,
    CloudAgentInputError,
    readCloudAgentInput,
    requireLiveCloudRun,
} from './cloud-agent-input-store.ts';
import { isCloudAgentRequestChatLive } from './cloud-agent-request-chat.ts';
import { projectNativeCloudAgentRun } from './project-native-cloud-agent-run.ts';

export async function registerCloudAgentInput(
    db: HausDatabase,
    scope: CloudAgentCallbackScope,
    input: Extract<CloudAgentCallback, { kind: 'question' }>,
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
            throw new CloudAgentInputError(
                'Question does not belong to an accepted native prompt.'
            );
        }
        // A continued question consumes the original request, rather than registering another wait.
        if (prompt.requestId) {
            const original = await readCloudAgentInput(tx, scope.serverId, prompt.requestId);
            await requireLiveCloudRun(tx, scope);
            if (
                original.state !== 'answered' ||
                !isDeepStrictEqual(original.questions, input.questions)
            ) {
                throw new CloudAgentInputError(
                    'The continued question changed or is no longer answered.'
                );
            }
            if (prompt.toolUseId && prompt.toolUseId !== input.toolUseId) {
                throw new CloudAgentInputError(
                    'The continuation already issued a different question tool.'
                );
            }
            await tx
                .update(cloudAgentPromptsTable)
                .set({ toolUseId: input.toolUseId })
                .where(eq(cloudAgentPromptsTable.promptId, input.promptId));
            return { request: original, events: [], wake: null };
        }
        const [duplicate] = await tx
            .select({ id: cloudAgentInputTable.id })
            .from(cloudAgentInputTable)
            .where(
                and(
                    eq(cloudAgentInputTable.runId, scope.runId),
                    eq(cloudAgentInputTable.sessionId, input.sessionId),
                    eq(cloudAgentInputTable.promptId, input.promptId),
                    eq(cloudAgentInputTable.toolUseId, input.toolUseId)
                )
            )
            .limit(1);
        if (duplicate) {
            const stored = await readCloudAgentInput(tx, scope.serverId, duplicate.id);
            if (
                !isDeepStrictEqual(stored.questions, input.questions) ||
                stored.state === 'cancelled'
            ) {
                throw new CloudAgentInputError('Conflicting or cancelled native question.');
            }
            return { request: stored, events: [], wake: null };
        }
        await requireLiveCloudRun(tx, scope);
        await requireRequestingChat(tx, scope);
        const id = createOpaqueId('cai');
        await tx.insert(cloudAgentInputTable).values({
            id,
            serverId: scope.serverId,
            runId: scope.runId,
            sessionId: input.sessionId,
            promptId: input.promptId,
            toolUseId: input.toolUseId,
            questions: input.questions,
        });
        const now = new Date();
        await tx
            .update(cloudAgentRunsTable)
            .set({ status: 'pending_input', observedAt: now })
            .where(eq(cloudAgentRunsTable.id, scope.runId));
        await projectNativeCloudAgentRun(tx, scope, { status: 'pending_input', updatedAt: now });
        await delivery.enqueue(tx, {
            agentId: scope.agentId,
            chatId: scope.chatId,
            content: '',
            dedupeKey: id,
            serverId: scope.serverId,
            source: 'cloud_agent_input',
        });
        return {
            request: await readCloudAgentInput(tx, scope.serverId, id),
            events: await prepareCloudAgentWorkEvents(tx, {
                serverId: scope.serverId,
                workId: scope.workId,
            }),
            wake: { agentId: scope.agentId, serverId: scope.serverId },
        };
    });
}

async function requireRequestingChat(db: HausDatabase, scope: CloudAgentCallbackScope) {
    if (
        !(await isCloudAgentRequestChatLive(db, { serverId: scope.serverId, chatId: scope.chatId }))
    ) {
        throw new CloudAgentInputError('The conversation requesting this work no longer exists.');
    }
}
