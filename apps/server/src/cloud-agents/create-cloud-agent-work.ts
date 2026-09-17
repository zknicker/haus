import type {
    AgentCloudAgentReceipt,
    AgentCloudAgentStartInput,
    ServerDurableEvent,
} from '@haus/api';
import { agentCloudAgentStartInputSchema } from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import {
    findAgentMessageByNonce,
    planAgentAuthoredMessage,
    writeAgentAuthoredMessage,
} from '../chats/agent-authored-message.ts';
import { canonicalizeAgentMessageContentForPersistence } from '../chats/canonicalize-agent-references.ts';
import { resolveInlineReplyParent } from '../chats/reply-context.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable, cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { insertCloudAgentWorkEvent } from './cloud-agent-events.ts';
import { findCloudAgentWorkByMessage } from './cloud-agent-shape.ts';
import { CloudAgentAgentNotFoundError, CloudAgentWorkConflictError } from './errors.ts';

export interface CreateCloudAgentWorkResult {
    events: ServerDurableEvent[];
    receipt: AgentCloudAgentReceipt;
    wakes: Array<{ agentId: string; serverId: string }>;
}

/**
 * Writes one Cloud Agent work: the Agent-authored Message whose content is the
 * Agent's own words, the work record, its first Run in `queued`, the
 * deterministic child Thread when the work is top-level, ordinary delivery
 * planning, and the durable events — all in one transaction, idempotent by the
 * message nonce. The Computer launches the provider only after this commits, so
 * a later provider failure settles this same work rather than erasing it.
 */
export async function createCloudAgentWork(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentCloudAgentStartInput,
    agentDelivery: AgentDelivery
): Promise<CreateCloudAgentWorkResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const plan = await planAgentAuthoredMessage(tx, runner, input.target);

        const existing = await readWorkByNonce(tx, runner, plan.chatId, input);
        if (existing) {
            return { events: [], receipt: existing, wakes: [] };
        }

        const computerId = await requireAssignedComputer(tx, runner);
        const content = agentCloudAgentStartInputSchema.shape.content.parse(
            await canonicalizeAgentMessageContentForPersistence(tx, {
                content: input.content,
                serverId: runner.serverId,
            })
        );
        const written = await writeAgentAuthoredMessage(
            tx,
            runner,
            plan,
            {
                bodyKind: 'cloud-agent-work',
                content,
                nonce: input.nonce,
                replyToMessageId: input.replyToMessageId,
            },
            agentDelivery
        );

        const workId = createOpaqueId('caw');
        await tx.insert(cloudAgentWorkTable).values({
            agentId: runner.agentId,
            chatId: plan.chatId,
            computerId,
            id: workId,
            messageId: written.messageId,
            provider: input.provider,
            repository: input.repository,
            serverId: runner.serverId,
            startingRef: input.startingRef,
            title: input.title,
        });
        const runId = createOpaqueId('car');
        await tx.insert(cloudAgentRunsTable).values({
            id: runId,
            serverId: runner.serverId,
            workId,
        });

        const events = [
            written.event,
            await insertCloudAgentWorkEvent(tx, {
                chat: written.chat,
                chatId: plan.chatId,
                cloudAgentWorkId: workId,
                messageId: written.messageId,
                sequence: written.sequence,
                serverId: runner.serverId,
            }),
        ];
        const work = await findCloudAgentWorkByMessage(tx, runner.serverId, written.messageId);
        if (!work) {
            throw new Error('The Cloud Agent work could not be projected after creation.');
        }

        return {
            events,
            receipt: {
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
    const content = await canonicalizeAgentMessageContentForPersistence(db, {
        content: input.content,
        existingContent: message.content,
        serverId: runner.serverId,
    });
    const work = await findCloudAgentWorkByMessage(db, runner.serverId, message.id);
    const reply = input.replyToMessageId
        ? await resolveInlineReplyParent(db, {
              chatId,
              replyToMessageId: input.replyToMessageId,
              serverId: runner.serverId,
          })
        : null;
    if (
        !work ||
        message.authorAgentId !== runner.agentId ||
        message.content !== content ||
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
        chatId,
        idempotent: true,
        messageId: message.id,
        runId: firstRun.id,
        sequence: message.sequence,
        target: input.target,
        work,
    };
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
