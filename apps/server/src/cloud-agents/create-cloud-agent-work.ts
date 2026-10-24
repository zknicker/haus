import type {
    AgentCloudAgentHeld,
    AgentCloudAgentReceipt,
    AgentCloudAgentStartInput,
} from '@haus/api';
import {
    agentCloudAgentStartInputSchema,
    chatMessageAuthoredContentMaxLength,
    formatCloudAgentWorkLink,
} from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import { readFreshnessHold } from '../agent-api/send-hold.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { resolveAgentMessageCause } from '../automations/infer-message-cause.ts';
import { insertMessageCause } from '../automations/message-cause.ts';
import {
    findAgentMessageByNonce,
    planAgentAuthoredMessage,
    writeAgentAuthoredMessage,
} from '../chats/agent-authored-message.ts';
import { canonicalizeAgentMessageContentForPersistence } from '../chats/canonicalize-agent-references.ts';
import {
    recordCloudAgentWorkLinks,
    replayCloudAgentWorkLinks,
    resolveCloudAgentWorkLinks,
} from '../chats/cloud-agent-work-links.ts';
import { resolveInlineReplyParent } from '../chats/reply-context.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable, cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { prepareLinkedWorkEvents } from './cloud-agent-events.ts';
import { resolveRunModel } from './cloud-agent-model.ts';
import { findCloudAgentWork, findCloudAgentWorkByLaunchMessage } from './cloud-agent-shape.ts';
import { CloudAgentAgentNotFoundError, CloudAgentWorkConflictError } from './errors.ts';

export type CreateCloudAgentWorkResult =
    | {
          events: PreparedRealtimeEvent[];
          kind: 'started';
          receipt: AgentCloudAgentReceipt;
          wakes: Array<{ agentId: string; serverId: string }>;
      }
    | { held: AgentCloudAgentHeld; kind: 'held' };

/**
 * Writes one Cloud Agent work: an ordinary text Message holding the Agent's
 * own words plus a Server-trusted link to the new work (ADR 0044), the work
 * record, its first Run in `queued`, the Message's links, the deterministic
 * child Thread and follow when the Message is top-level, ordinary delivery
 * planning, and the durable events — all in one transaction, idempotent by the
 * message nonce. The Computer launches the provider only after this commits, so
 * a later provider failure settles this same work rather than erasing it.
 *
 * A new launch first runs the `haus message send` freshness check against the
 * target Chat. When it holds, nothing is written beyond the served-visibility
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
        // A launch card is an inline reply with its own work Thread, so a
        // launch never opens a new Thread on any anchor, the Agent's own included.
        const plan = await planAgentAuthoredMessage(tx, runner, input.target, 'refuse');

        const existing = await readWorkByNonce(tx, runner, plan.chatId, input);
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
                target: input.target,
                work,
            },
            wakes: written.wakes,
        };
    });
}

/**
 * A replay rebuilds the whole stored content from `--say`, the links the
 * launch recorded, and the trusted suffix, then compares; it never strips
 * link syntax to make a retry match.
 */
async function readWorkByNonce(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    input: AgentCloudAgentStartInput
): Promise<AgentCloudAgentReceipt | null> {
    const message = await findAgentMessageByNonce(db, {
        chatId,
        nonce: input.nonce,
        serverId: runner.serverId,
    });
    if (!message) {
        return null;
    }
    const work = await findCloudAgentWorkByLaunchMessage(db, runner.serverId, message.id);
    if (!work) {
        throw new CloudAgentWorkConflictError();
    }
    const authored = await authoredContent(db, runner.serverId, input.content, message.content);
    const expected = withLaunchLink(
        await replayCloudAgentWorkLinks(db, {
            content: authored,
            messageId: message.id,
            serverId: runner.serverId,
        }),
        work.title,
        work.id
    );
    const reply = input.replyToMessageId
        ? await resolveInlineReplyParent(db, {
              chatId,
              replyToMessageId: input.replyToMessageId,
              serverId: runner.serverId,
          })
        : null;
    if (
        message.authorAgentId !== runner.agentId ||
        message.content !== expected ||
        message.replyToMessageId !== (reply?.parent.id ?? null) ||
        work.title !== input.title ||
        work.repository !== input.repository ||
        work.startingRef !== input.startingRef ||
        work.provider !== input.provider
    ) {
        throw new CloudAgentWorkConflictError();
    }
    const [firstRun] = await db
        .select({ id: cloudAgentRunsTable.id })
        .from(cloudAgentRunsTable)
        .where(
            and(
                eq(cloudAgentRunsTable.serverId, runner.serverId),
                eq(cloudAgentRunsTable.workId, work.id)
            )
        )
        .orderBy(asc(cloudAgentRunsTable.createdAt))
        .limit(1);
    if (!firstRun) {
        throw new CloudAgentWorkConflictError('That Cloud Agent work has no Run to launch.');
    }
    return {
        state: 'started',
        chatId,
        idempotent: true,
        messageId: message.id,
        runId: firstRun.id,
        sequence: message.sequence,
        target: input.target,
        work,
    };
}

/** `--say` with bare references resolved, within the authored content cap. */
async function authoredContent(
    db: HausDatabase,
    serverId: string,
    content: string,
    existingContent?: string
): Promise<string> {
    return agentCloudAgentStartInputSchema.shape.content.parse(
        await canonicalizeAgentMessageContentForPersistence(db, {
            content,
            existingContent,
            serverId,
        })
    );
}

function withLaunchLink(authored: string, title: string, workId: string): string {
    return `${authored}\n\n${formatCloudAgentWorkLink(title, workId)}`;
}

/** Cloud Agent work is owned by the Computer that holds the provider access. */
async function requireAssignedComputer(db: HausDatabase, runner: ResolvedRunner): Promise<string> {
    const [agent] = await db
        .select({ computerId: agentsTable.computerId })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)))
        .limit(1);
    if (!agent?.computerId) {
        throw new CloudAgentAgentNotFoundError();
    }
    return agent.computerId;
}
