import type { AgentActivityEvent, ServerDurableEvent, TaskClaimConflict } from '@haus/api';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { readAgentSessionGeneration } from '../agent-delivery/cursors.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import {
    type AgentMessageRecipientPlan,
    planAgentMessageRecipients,
} from '../agent-delivery/message-recipients.ts';
import { allocateEventCursor } from '../chats/allocate-event-cursor.ts';
import { requireChatWritable } from '../chats/chat-access.ts';
import { followInlineReplyForMessage } from '../chats/reply-subscriptions.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentsTable,
    channelAgentParticipantsTable,
    chatEventsTable,
    chatMessagesTable,
    chatsTable,
    messageTasksTable,
} from '../postgres/schema.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { buildTaskClaimConflict } from '../tasks/claim-conflict.ts';
import { taskAssignmentEnvelope, taskAssignmentKey } from '../tasks/task-assignment-envelope.ts';
import { insertTaskEvent } from '../tasks/task-events.ts';
import { agentOwnsTask, taskHasOtherOwnerForAgent } from '../tasks/task-ownership.ts';
import { stampsTaskTracked } from '../tasks/task-tier.ts';
import { resolveAgentMessage } from './message-read.ts';
import { messageSelection, targetForChat, visibleChatSql } from './message-view.ts';
import { resolveAgentTarget } from './resolve-target.ts';
import { hasUnseenTaskThreadContext } from './task-freshness.ts';
import { agentHandle, stripAt, taskRow } from './task-row.ts';

type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'closed';

export async function listAgentTasks(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { status?: TaskStatus; target?: string }
) {
    const chatId = input.target ? await resolveAgentTarget(db, runner, input.target) : null;
    const rows = await db
        .select({ message: messageSelection, task: messageTasksTable })
        .from(messageTasksTable)
        .innerJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, messageTasksTable.serverId),
                eq(chatMessagesTable.id, messageTasksTable.messageId)
            )
        )
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, messageTasksTable.serverId),
                eq(chatsTable.id, messageTasksTable.chatId)
            )
        )
        .where(
            and(
                eq(messageTasksTable.serverId, runner.serverId),
                chatId ? eq(messageTasksTable.chatId, chatId) : visibleChatSql(runner),
                input.status ? eq(messageTasksTable.status, input.status) : undefined
            )
        )
        .orderBy(desc(messageTasksTable.updatedAt));
    return {
        tasks: await Promise.all(
            rows.map(async (row) => taskRow(db, runner, row.message, row.task))
        ),
    };
}

export async function createAgentTasks(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: {
        assignee?: string;
        content?: string;
        nonce: string;
        target: string;
        titles?: string[];
    },
    agentDelivery: AgentDelivery
) {
    const titles = input.titles?.length ? input.titles : input.content ? [input.content] : [];
    if (titles.length === 0 || titles.some((title) => !title.trim())) {
        throw new AgentTaskError('Task content is required.');
    }
    const chatId = await resolveAgentTarget(db, runner, input.target);
    const assigneeAgentId = input.assignee
        ? await resolveTaskAssignee(db, runner, chatId, input.assignee)
        : null;
    const selfClaim = assigneeAgentId === runner.agentId;
    const nonces = titles.map((_, index) => `${input.nonce}:${index}`);
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        await requireChatWritable(tx, { chatId, serverId: runner.serverId });
        await requireTopLevelTaskChat(tx, runner, chatId);
        const replay = await replayAgentTasks(tx, runner, chatId, titles, nonces, assigneeAgentId);
        if (replay) {
            return { activities: [], events: [], tasks: replay, wakes: [] };
        }
        const sessionGeneration = await readAgentSessionGeneration(tx, runner.agentId);
        const created: Awaited<ReturnType<typeof taskRow>>[] = [];
        const activities: AgentActivityEvent[] = [];
        const events: ServerDurableEvent[] = [];
        const wakes = new Set<string>();
        for (const [index, title] of titles.entries()) {
            const startedActivity = await appendServerAgentActivity(tx, {
                agentId: runner.agentId,
                category: 'sending_message',
                phase: 'started',
                runId: runner.runId,
                serverId: runner.serverId,
            });
            if (startedActivity) {
                activities.push(startedActivity);
            }
            const [numberedChat] = await tx
                .update(chatsTable)
                .set({
                    lastActivityAt: sql`now()`,
                    lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1`,
                    lastTaskNumber: sql`${chatsTable.lastTaskNumber} + 1`,
                })
                .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
                .returning({
                    messageSequence: chatsTable.lastMessageSequence,
                    taskNumber: chatsTable.lastTaskNumber,
                });
            if (!numberedChat) {
                throw new AgentTaskError('That task target no longer exists.');
            }
            const messageId = createOpaqueId('msg');
            const [message] = await tx
                .insert(chatMessagesTable)
                .values({
                    authorAgentId: runner.agentId,
                    chatId,
                    content: title.trim(),
                    id: messageId,
                    nonce: nonces[index],
                    replyRootMessageId: messageId,
                    runId: runner.runId,
                    sequence: numberedChat.messageSequence,
                    serverId: runner.serverId,
                    sessionGeneration,
                })
                .returning(messageSelection);
            const completedActivity = await appendServerAgentActivity(tx, {
                agentId: runner.agentId,
                category: 'sending_message',
                phase: 'completed',
                runId: runner.runId,
                serverId: runner.serverId,
            });
            if (completedActivity) {
                activities.push(completedActivity);
            }
            await tx.insert(messageTasksTable).values({
                assigneeAgentId,
                chatId,
                claimedAt: selfClaim ? sql`now()` : null,
                createdByAgentId: runner.agentId,
                messageId: message.id,
                number: numberedChat.taskNumber,
                origin: 'composed',
                serverId: runner.serverId,
                status: selfClaim ? 'in_progress' : 'todo',
            });
            if (assigneeAgentId) {
                await followInlineReplyForMessage(tx, {
                    agentId: assigneeAgentId,
                    chatId,
                    messageId: message.id,
                    serverId: runner.serverId,
                });
            }
            // The handoff is a private Agent delivery: a typed inbox item keyed
            // by the assignment identity, never a hidden Chat message.
            const assignmentEnvelope =
                assigneeAgentId && assigneeAgentId !== runner.agentId
                    ? taskAssignmentEnvelope({
                          assignedByHandle: await agentHandle(tx, runner),
                          number: numberedChat.taskNumber,
                          target: await targetForChat(tx, runner.serverId, chatId),
                          title: title.trim(),
                      })
                    : null;
            const recipients = await planAgentMessageRecipients(tx, {
                authorAgentId: runner.agentId,
                chatId,
                content: title.trim(),
                messageId: message.id,
                serverId: runner.serverId,
            });
            if (assigneeAgentId && assigneeAgentId !== runner.agentId) {
                recipients.push({
                    // The assignment's own concrete item carries the personal
                    // attention; the canonical task message stays ambient.
                    addressedReason: null,
                    agentId: assigneeAgentId,
                    mentioned: false,
                    threadFollowReactivated: false,
                });
            }
            for (const recipient of dedupeRecipients(recipients)) {
                await agentDelivery.enqueue(tx, {
                    addressedReason: recipient.addressedReason,
                    agentId: recipient.agentId,
                    chatId,
                    content: title.trim(),
                    dedupeKey: message.id,
                    mentioned: recipient.mentioned,
                    sequence: message.sequence,
                    serverId: runner.serverId,
                    source: `agent:${await agentHandle(tx, runner)}`,
                    threadFollowReactivated: recipient.threadFollowReactivated,
                });
                wakes.add(recipient.agentId);
            }
            if (assignmentEnvelope && assigneeAgentId) {
                await agentDelivery.enqueue(tx, {
                    agentId: assigneeAgentId,
                    chatId,
                    content: assignmentEnvelope,
                    dedupeKey: taskAssignmentKey(message.id, 1),
                    mentioned: true,
                    serverId: runner.serverId,
                    source: 'task_assignment',
                });
                wakes.add(assigneeAgentId);
            }
            events.push(
                await insertAgentMessageCreatedEvent(tx, {
                    chatId,
                    messageId: message.id,
                    sequence: message.sequence,
                    serverId: runner.serverId,
                }),
                await insertTaskEvent(tx, {
                    chatId,
                    messageId: message.id,
                    serverId: runner.serverId,
                    type: 'task.created',
                })
            );
            const [task] = await tx
                .select()
                .from(messageTasksTable)
                .where(
                    and(
                        eq(messageTasksTable.serverId, runner.serverId),
                        eq(messageTasksTable.messageId, message.id)
                    )
                );
            created.push(await taskRow(tx, runner, message, task));
        }
        return {
            activities,
            events,
            tasks: created,
            wakes: [...wakes].map((agentId) => ({ agentId, serverId: runner.serverId })),
        };
    });
}

export async function claimAgentTasks(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { messageId?: string; numbers?: number[]; target: string }
) {
    const chatId = await resolveAgentTarget(db, runner, input.target);
    const messageId = input.messageId
        ? (await resolveAgentMessage(db, runner, input.messageId)).id
        : undefined;
    let tasks = await queryAgentTasks(db, runner, chatId, {
        ...input,
        messageId,
    });
    const events: ServerDurableEvent[] = [];
    if (tasks.length === 0 && messageId) {
        const promoted = await promoteAgentMessageTask(db, runner, chatId, messageId);
        tasks = [promoted.task];
        events.push(...promoted.events);
    }
    if (tasks.length === 0) {
        throw new AgentTaskError('No matching task exists in that target.');
    }
    const claimed: Awaited<ReturnType<typeof taskRow>>[] = [];
    for (const task of tasks) {
        const result = await mutateAgentTask(db, runner, task.messageId, task.version, 'claim');
        claimed.push(result.task);
        if (result.event) {
            events.push(result.event);
        }
    }
    return { claimed, events };
}

export async function unclaimAgentTask(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { number: number; target: string }
) {
    const chatId = await resolveAgentTarget(db, runner, input.target);
    const [task] = await findAgentTasks(db, runner, chatId, { numbers: [input.number] });
    return await mutateAgentTask(db, runner, task.messageId, task.version, 'unclaim');
}

export async function updateAgentTask(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { number: number; status: TaskStatus; target: string }
) {
    const chatId = await resolveAgentTarget(db, runner, input.target);
    const [task] = await findAgentTasks(db, runner, chatId, { numbers: [input.number] });
    return await mutateAgentTask(db, runner, task.messageId, task.version, 'update', input.status);
}

async function mutateAgentTask(
    db: HausDatabase,
    runner: ResolvedRunner,
    messageId: string,
    expectedVersion: number,
    action: 'claim' | 'unclaim' | 'update',
    status?: TaskStatus
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const [current] = await tx
            .select()
            .from(messageTasksTable)
            .where(
                and(
                    eq(messageTasksTable.serverId, runner.serverId),
                    eq(messageTasksTable.messageId, messageId)
                )
            )
            .for('update');
        if (!current) {
            throw new AgentTaskError('That task no longer exists.');
        }
        await requireChatWritable(tx, {
            chatId: current.chatId,
            serverId: runner.serverId,
        });
        if (
            action === 'claim' &&
            current.assigneeAgentId === runner.agentId &&
            current.claimedAt !== null
        ) {
            return await repeatAgentTaskClaim(tx, runner, messageId, current);
        }
        // The holder is the authoritative answer to a claim, whatever version
        // the caller read: two Agents racing for the same lock both read the
        // task before either wrote it, so checking the version first would
        // hand the loser of the real race a refresh notice instead of the
        // structured conflict that says who holds it.
        if (action === 'claim' && taskHasOtherOwnerForAgent(current, runner.agentId)) {
            throw new AgentTaskError('That task is already owned by another assignee.', {
                claimConflict: await buildTaskClaimConflict(
                    tx,
                    runner.serverId,
                    current,
                    new Date()
                ),
            });
        }
        if (current.version !== expectedVersion) {
            throw new AgentTaskError('That task changed; refresh it before updating.');
        }
        if (
            (action === 'claim' || action === 'update') &&
            (await hasUnseenTaskThreadContext(tx, runner, messageId))
        ) {
            throw new AgentTaskError(
                'New context exists in this task thread. Run haus message check before retrying.'
            );
        }
        if (action === 'unclaim' && current.assigneeAgentId !== runner.agentId) {
            throw new AgentTaskError('Only the current assignee may unclaim this task.');
        }
        if (
            action === 'update' &&
            (!agentOwnsTask(current, runner.agentId) || current.claimedAt === null)
        ) {
            throw new AgentTaskError('Only the current assignee may update this task.');
        }
        if ((action === 'claim' || action === 'unclaim') && current.status === 'done') {
            throw new AgentTaskError('Done tasks cannot be claimed or unclaimed.');
        }
        const [updated] = await tx
            .update(messageTasksTable)
            .set({
                ...(action === 'claim'
                    ? {
                          assigneeAgentId: runner.agentId,
                          assigneeUserId: null,
                          claimedAt: sql`now()`,
                          status: current.status === 'todo' ? 'in_progress' : current.status,
                      }
                    : {}),
                ...(action === 'unclaim'
                    ? { assigneeAgentId: null, assigneeUserId: null, claimedAt: null }
                    : {}),
                // Leaving the claim's own `in_progress`/`done` lifecycle is the
                // Agent saying a human has to look: tracked from here on.
                ...(action === 'update'
                    ? { status, ...(stampsTaskTracked(status) ? { trackedAt: sql`now()` } : {}) }
                    : {}),
                updatedAt: sql`now()`,
                version: sql`${messageTasksTable.version} + 1`,
            })
            .where(
                and(
                    eq(messageTasksTable.serverId, runner.serverId),
                    eq(messageTasksTable.messageId, messageId),
                    eq(messageTasksTable.version, expectedVersion)
                )
            )
            .returning({ version: messageTasksTable.version });
        if (!updated) {
            throw new AgentTaskError('That task changed; refresh it before updating.');
        }
        await followClaimedTask(tx, action, runner, current.chatId, messageId);
        const event = await insertTaskEvent(tx, {
            chatId: current.chatId,
            messageId: current.messageId,
            serverId: runner.serverId,
            type: 'task.updated',
        });
        const [next] = await tx
            .select()
            .from(messageTasksTable)
            .where(
                and(
                    eq(messageTasksTable.serverId, runner.serverId),
                    eq(messageTasksTable.messageId, messageId)
                )
            );
        const [message] = await tx
            .select(messageSelection)
            .from(chatMessagesTable)
            .where(
                and(
                    eq(chatMessagesTable.serverId, runner.serverId),
                    eq(chatMessagesTable.id, messageId)
                )
            );
        return { event, task: await taskRow(tx, runner, message, next) };
    });
}

async function repeatAgentTaskClaim(
    db: HausDatabase,
    runner: ResolvedRunner,
    messageId: string,
    task: typeof messageTasksTable.$inferSelect
) {
    const [message] = await db
        .select(messageSelection)
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, runner.serverId),
                eq(chatMessagesTable.id, messageId)
            )
        );
    await followInlineReplyForMessage(db, {
        agentId: runner.agentId,
        chatId: task.chatId,
        messageId,
        serverId: runner.serverId,
    });
    return { event: null, task: await taskRow(db, runner, message, task) };
}

async function followClaimedTask(
    db: HausDatabase,
    action: 'claim' | 'unclaim' | 'update',
    runner: ResolvedRunner,
    chatId: string,
    messageId: string
) {
    if (action !== 'claim') {
        return;
    }
    await followInlineReplyForMessage(db, {
        agentId: runner.agentId,
        chatId,
        messageId,
        serverId: runner.serverId,
    });
}

async function findAgentTasks(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    input: { messageId?: string; numbers?: number[] }
) {
    const rows = await queryAgentTasks(db, runner, chatId, input);
    if (rows.length === 0) {
        throw new AgentTaskError('No matching task exists in that target.');
    }
    return rows;
}

async function queryAgentTasks(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    input: { messageId?: string; numbers?: number[] }
) {
    return await db
        .select()
        .from(messageTasksTable)
        .where(
            and(
                eq(messageTasksTable.serverId, runner.serverId),
                eq(messageTasksTable.chatId, chatId),
                input.messageId ? eq(messageTasksTable.messageId, input.messageId) : undefined,
                input.numbers?.length ? inArray(messageTasksTable.number, input.numbers) : undefined
            )
        );
}

async function promoteAgentMessageTask(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    messageId: string
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        await requireChatWritable(tx, { chatId, serverId: runner.serverId });
        await requireTopLevelTaskChat(tx, runner, chatId);
        const [message] = await tx
            .select({
                chatId: chatMessagesTable.chatId,
                id: chatMessagesTable.id,
            })
            .from(chatMessagesTable)
            .where(
                and(
                    eq(chatMessagesTable.serverId, runner.serverId),
                    eq(chatMessagesTable.chatId, chatId),
                    eq(chatMessagesTable.id, messageId)
                )
            )
            .limit(1);
        if (!message) {
            throw new AgentTaskError('That message is not in the selected target.');
        }
        const existing = await queryAgentTasks(tx, runner, chatId, { messageId });
        if (existing[0]) {
            return { events: [], task: existing[0] };
        }
        const [numberedChat] = await tx
            .update(chatsTable)
            .set({ lastTaskNumber: sql`${chatsTable.lastTaskNumber} + 1` })
            .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
            .returning({ number: chatsTable.lastTaskNumber });
        if (!numberedChat) {
            throw new AgentTaskError('That task target no longer exists.');
        }
        await tx.insert(messageTasksTable).values({
            assigneeAgentId: runner.agentId,
            chatId,
            claimedAt: sql`now()`,
            createdByAgentId: runner.agentId,
            messageId,
            number: numberedChat.number,
            origin: 'claimed',
            serverId: runner.serverId,
            status: 'in_progress',
        });
        await followInlineReplyForMessage(tx, {
            agentId: runner.agentId,
            chatId,
            messageId,
            serverId: runner.serverId,
        });
        const [created] = await queryAgentTasks(tx, runner, chatId, { messageId });
        if (!created) {
            throw new Error('Task conversion did not persist.');
        }
        const event = await insertTaskEvent(tx, {
            chatId,
            messageId,
            serverId: runner.serverId,
            type: 'task.created',
        });
        return { events: [event], task: created };
    });
}

async function insertAgentMessageCreatedEvent(
    db: HausDatabase,
    input: { chatId: string; messageId: string; sequence: number; serverId: string }
): Promise<ServerDurableEvent> {
    const cursor = await allocateEventCursor(db, input.serverId);
    const [event] = await db
        .insert(chatEventsTable)
        .values({
            chatId: input.chatId,
            cursor,
            id: createOpaqueId('evt'),
            messageId: input.messageId,
            sequence: input.sequence,
            serverId: input.serverId,
            type: 'message.created',
        })
        .returning({ createdAt: chatEventsTable.createdAt, id: chatEventsTable.id });

    return {
        chatId: input.chatId,
        createdAt: event.createdAt.toISOString(),
        cursor: cursor.toString(),
        id: event.id,
        messageId: input.messageId,
        parentChatId: null,
        sequence: input.sequence,
        serverId: input.serverId,
        type: 'message.created',
    };
}

/**
 * Tasks live on top-level messages only. Promotion validates that here and
 * stops: the Thread is not created until someone actually replies, so a claim
 * an Agent resolves inside one turn leaves no work surface behind.
 */
async function requireTopLevelTaskChat(
    db: HausDatabase,
    runner: ResolvedRunner,
    parentChatId: string
) {
    const [parent] = await db
        .select({ kind: chatsTable.kind })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, parentChatId)));
    if (!parent || parent.kind === 'thread') {
        throw new AgentTaskError('Tasks require a top-level Channel or DM.');
    }
}

async function resolveTaskAssignee(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    value: string
) {
    const handle = stripAt(value);
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                eq(agentsTable.handle, handle),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!agent) {
        throw new AgentTaskError(`No active Agent has handle @${handle}.`);
    }
    if (agent.id === runner.agentId) {
        return agent.id;
    }
    const [joined] = await db
        .select({ agentId: channelAgentParticipantsTable.agentId })
        .from(channelAgentParticipantsTable)
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, runner.serverId),
                eq(channelAgentParticipantsTable.chatId, chatId),
                eq(channelAgentParticipantsTable.agentId, agent.id)
            )
        )
        .limit(1);
    if (!joined) {
        throw new AgentTaskError('The assigned Agent must belong to the target Channel.');
    }
    return agent.id;
}

async function replayAgentTasks(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    titles: string[],
    nonces: string[],
    assigneeAgentId: string | null
) {
    const existing = await db
        .select(messageSelection)
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, runner.serverId),
                eq(chatMessagesTable.chatId, chatId),
                inArray(chatMessagesTable.nonce, nonces)
            )
        );
    if (existing.length === 0) {
        return null;
    }
    if (existing.length !== titles.length) {
        throw new AgentTaskError('That task creation nonce belongs to an incomplete replay.');
    }
    const byNonce = new Map(existing.map((message) => [message.nonce, message]));
    return await Promise.all(
        titles.map(async (title, index) => {
            const message = byNonce.get(nonces[index] ?? '');
            if (message?.authorAgentId !== runner.agentId || message.content !== title.trim()) {
                throw new AgentTaskError('That task creation nonce belongs to different content.');
            }
            const [task] = await queryAgentTasks(db, runner, chatId, { messageId: message.id });
            if (!task) {
                throw new AgentTaskError('That task creation nonce has no canonical task.');
            }
            if (task.assigneeAgentId !== assigneeAgentId) {
                throw new AgentTaskError(
                    'That task creation nonce belongs to a different assignee.'
                );
            }
            return await taskRow(db, runner, message, task);
        })
    );
}

function dedupeRecipients(recipients: AgentMessageRecipientPlan[]) {
    const byAgent = new Map<string, AgentMessageRecipientPlan>();
    for (const recipient of recipients) {
        const current = byAgent.get(recipient.agentId);
        byAgent.set(recipient.agentId, {
            addressedReason: recipient.addressedReason ?? current?.addressedReason ?? null,
            agentId: recipient.agentId,
            mentioned: Boolean(current?.mentioned || recipient.mentioned),
            threadFollowReactivated: Boolean(
                current?.threadFollowReactivated || recipient.threadFollowReactivated
            ),
        });
    }
    return [...byAgent.values()];
}

/**
 * A task refusal. A lost claim also carries the structured conflict the Agent
 * CLI renders: who holds the lock, when that was observed, what the lock
 * actually blocks, and what it does not.
 */
export class AgentTaskError extends Error {
    readonly claimConflict: TaskClaimConflict | null;

    constructor(message: string, options: { claimConflict?: TaskClaimConflict } = {}) {
        super(message);
        this.claimConflict = options.claimConflict ?? null;
    }
}
