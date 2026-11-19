import type { AgentWorkerHeld, AgentWorkerReceipt, AgentWorkerStartInput } from '@haus/api';
import { chatMessageAuthoredContentMaxLength } from '@haus/api';
import { readFreshnessHold } from '../agent-api/send-hold.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { resolveAgentMessageCause } from '../automations/infer-message-cause.ts';
import { insertMessageCause } from '../automations/message-cause.ts';
import {
    planAgentAuthoredMessage,
    writeAgentAuthoredMessage,
} from '../chats/agent-authored-message.ts';
import { recordWorkerLinks, resolveWorkerLinks } from '../chats/worker-links.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { prepareTaskUpdatedEvent } from '../tasks/task-events.ts';
import { readTask } from '../tasks/task-read.ts';
import { resolveRunModel } from './cloud-agent-model.ts';
import { prepareLinkedWorkEvents } from './worker-events.ts';
import { requireAssignedComputer, requireLaunchTask } from './worker-launch-task.ts';
import { authoredContent, readWorkByNonce, withLaunchLink } from './worker-replay.ts';
import { findWorker } from './worker-shape.ts';

export type CreateWorkerResult =
    | {
          events: PreparedRealtimeEvent[];
          kind: 'started';
          receipt: AgentWorkerReceipt;
          wakes: Array<{ agentId: string; serverId: string }>;
      }
    | { held: AgentWorkerHeld; kind: 'held' };

export async function createWorker(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentWorkerStartInput,
    agentDelivery: AgentDelivery
): Promise<CreateWorkerResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const task = await requireLaunchTask(tx, runner, input.task);
        const plan = await planAgentAuthoredMessage(tx, runner, task.target);

        const existing = await readWorkByNonce(tx, runner, task, input);
        if (existing) {
            return { events: [], kind: 'started', receipt: existing, wakes: [] };
        }

        const computerId = await requireAssignedComputer(tx, runner);
        const authored = await authoredContent(tx, runner.serverId, input.content);
        // As on `haus message send`: an unknown or borrowed fire is refused
        // before the hold check, never held.
        const cause = await resolveAgentMessageCause(tx, {
            ...runner,
            cause: input.cause,
            chatId: plan.chatId,
        });
        const hold = await readFreshnessHold(tx, runner, plan.chatId);
        if (hold) {
            return { held: { ...hold, state: 'held' }, kind: 'held' };
        }
        // Only the Agent's own words pass link authorization; the new work's
        // link is Server-trusted and always last.
        const linked = await resolveWorkerLinks(tx, {
            author: { agentId: runner.agentId, kind: 'agent' },
            content: authored,
            serverId: runner.serverId,
        });
        const workerId = createOpaqueId('caw');
        const content = withLaunchLink(linked.content, input.title, workerId);
        const written = await writeAgentAuthoredMessage(
            tx,
            runner,
            plan,
            {
                bodyKind: 'text',
                content,
                // Released Computers cap inbox content at the authored limit.
                deliveryContent:
                    content.length > chatMessageAuthoredContentMaxLength ? linked.content : content,
                nonce: input.nonce,
                replyToMessageId: input.replyToMessageId,
            },
            agentDelivery
        );
        if (cause) {
            await insertMessageCause(tx, {
                attribution: cause.attribution,
                cause: cause.fire,
                messageId: written.messageId,
                serverId: runner.serverId,
            });
        }

        await tx.insert(workersTable).values({
            agentId: runner.agentId,
            chatId: plan.chatId,
            computerId,
            id: workerId,
            launchMessageId: written.messageId,
            provider: input.provider,
            repository: input.repository,
            serverId: runner.serverId,
            startingRef: input.startingRef,
            taskId: task.taskId,
            title: input.title,
        });
        const turnId = createOpaqueId('car');
        const model = await resolveRunModel(tx, {
            computerId,
            provider: input.provider,
            serverId: runner.serverId,
        });
        await tx.insert(workerTurnsTable).values({
            id: turnId,
            modelDroppedParams: model.droppedParams,
            modelFallbackFrom: model.fallbackFrom,
            modelId: model.id,
            modelParams: model.params,
            serverId: runner.serverId,
            workerId,
        });
        const links = [...linked.links, { ordinal: linked.links.length, workerId }];
        await recordWorkerLinks(tx, {
            chatId: plan.chatId,
            links,
            messageId: written.messageId,
            serverId: runner.serverId,
        });

        const work = await findWorker(tx, runner.serverId, workerId);
        if (!work) {
            throw new Error('The Worker could not be projected after creation.');
        }
        return {
            events: [
                written.event,
                ...(written.taskEvents.length > 0
                    ? written.taskEvents
                    : [prepareTaskUpdatedEvent(await readTask(tx, runner.serverId, task.taskId))]),
                ...(await prepareLinkedWorkEvents(tx, {
                    serverId: runner.serverId,
                    workerIds: links.map((link) => link.workerId),
                })),
            ],
            kind: 'started',
            receipt: {
                state: 'started',
                chatId: plan.chatId,
                idempotent: false,
                messageId: written.messageId,
                turnId,
                sequence: written.sequence,
                target: task.target,
                worker: work,
            },
            wakes: written.wakes,
        };
    });
}
