import type {
    AgentCloudAgentHeld,
    AgentCloudAgentReceipt,
    AgentCloudAgentStartInput,
} from '@haus/api';
import { chatMessageAuthoredContentMaxLength } from '@haus/api';
import { readFreshnessHold } from '../agent-api/send-hold.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { resolveAgentMessageCause } from '../automations/infer-message-cause.ts';
import { insertMessageCause } from '../automations/message-cause.ts';
import {
    planAgentAuthoredMessage,
    writeAgentAuthoredMessage,
} from '../chats/agent-authored-message.ts';
import {
    recordCloudAgentWorkLinks,
    resolveCloudAgentWorkLinks,
} from '../chats/cloud-agent-work-links.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { prepareTaskUpdatedEvent } from '../tasks/task-events.ts';
import { readTask } from '../tasks/task-read.ts';
import { prepareLinkedWorkEvents } from './cloud-agent-events.ts';
import { requireAssignedComputer, requireLaunchTask } from './cloud-agent-launch-task.ts';
import { resolveRunModel } from './cloud-agent-model.ts';
import { findCloudAgentWork } from './cloud-agent-shape.ts';
import { authoredContent, readWorkByNonce, withLaunchLink } from './cloud-agent-work-replay.ts';

export type CreateCloudAgentWorkResult =
    | {
          events: PreparedRealtimeEvent[];
          kind: 'started';
          receipt: AgentCloudAgentReceipt;
          wakes: Array<{ agentId: string; serverId: string }>;
      }
    | { held: AgentCloudAgentHeld; kind: 'held' };

/**
 * Writes one Cloud Agent work on a Task (ADR 0053 decision 6): an ordinary
 * text Message in the Task's Chat holding the Agent's own words plus a
 * Server-trusted link to the new work (ADR 0044), the work record attached to
 * the Task and reporting to its Chat, its first Run in `queued`, the Message's
 * links, ordinary delivery planning, and the durable events — all in one
 * transaction, idempotent by the message nonce. The Computer launches the
 * provider only after this commits, so a later provider failure settles this
 * same work rather than erasing it. A launch with no Task is refused.
 *
 * A new launch first runs the `haus message send` freshness check against the
 * Task's Chat. When it holds, nothing is written beyond the served-visibility
 * marks the check itself records, so a re-run (any nonce) is not held again
 * for the same messages. A committed nonce replays before the check.
 */
export async function createCloudAgentWork(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentCloudAgentStartInput,
    agentDelivery: AgentDelivery
): Promise<CreateCloudAgentWorkResult> {
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
        const linked = await resolveCloudAgentWorkLinks(tx, {
            author: { agentId: runner.agentId, kind: 'agent' },
            content: authored,
            serverId: runner.serverId,
        });
        const workId = createOpaqueId('caw');
        const content = withLaunchLink(linked.content, input.title, workId);
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

        // `chat_id` is the Task's Chat, so every Run notice reports to the Task.
        await tx.insert(cloudAgentWorkTable).values({
            agentId: runner.agentId,
            chatId: plan.chatId,
            computerId,
            id: workId,
            launchMessageId: written.messageId,
            provider: input.provider,
            repository: input.repository,
            serverId: runner.serverId,
            startingRef: input.startingRef,
            taskId: task.taskId,
            title: input.title,
        });
        const runId = createOpaqueId('car');
        const model = await resolveRunModel(tx, {
            computerId,
            provider: input.provider,
            serverId: runner.serverId,
        });
        await tx.insert(cloudAgentRunsTable).values({
            id: runId,
            modelDroppedParams: model.droppedParams,
            modelFallbackFrom: model.fallbackFrom,
            modelId: model.id,
            modelParams: model.params,
            serverId: runner.serverId,
            workId,
        });
        const links = [...linked.links, { ordinal: linked.links.length, workId }];
        await recordCloudAgentWorkLinks(tx, {
            chatId: plan.chatId,
            links,
            messageId: written.messageId,
            serverId: runner.serverId,
        });

        const work = await findCloudAgentWork(tx, runner.serverId, workId);
        if (!work) {
            throw new Error('The Cloud Agent work could not be projected after creation.');
        }
        return {
            events: [
                written.event,
                // The Task now lists this work: its reopen announces that, or attaching does.
                ...(written.taskEvents.length > 0
                    ? written.taskEvents
                    : [prepareTaskUpdatedEvent(await readTask(tx, runner.serverId, task.taskId))]),
                ...(await prepareLinkedWorkEvents(tx, {
                    serverId: runner.serverId,
                    workIds: links.map((link) => link.workId),
                })),
            ],
            kind: 'started',
            receipt: {
                state: 'started',
                chatId: plan.chatId,
                idempotent: false,
                messageId: written.messageId,
                runId,
                sequence: written.sequence,
                target: task.target,
                work,
            },
            wakes: written.wakes,
        };
    });
}
