import type { ServerDurableEvent, TaskClaimConflict } from '@haus/api';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { requireChatWritable } from '../chats/chat-access.ts';
import { followInlineReplyForMessage } from '../chats/reply-subscriptions.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable, messageTasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { buildTaskClaimConflict } from '../tasks/claim-conflict.ts';
import { insertTaskEvent } from '../tasks/task-events.ts';
import { taskHasOtherOwnerForAgent } from '../tasks/task-ownership.ts';
import { resolveAgentMessage } from './message-read.ts';
import { messageSelection } from './message-view.ts';
import { resolveAgentTarget } from './resolve-target.ts';
import { AgentTaskError } from './task-error.ts';
import { hasUnseenTaskThreadContext } from './task-freshness.ts';
import { queryAgentTasks, requireTopLevelTaskChat } from './task-lookup.ts';
import { type AgentTaskRow, taskRows } from './task-row.ts';

type TaskRecord = typeof messageTasksTable.$inferSelect;

/** `already_yours` still authorizes work: re-confirming your own claim is supported. */
export type TaskClaimOutcome = 'already_yours' | 'claimed' | 'refused';

export interface TaskClaimResult {
    claimConflict: TaskClaimConflict | null;
    number: number;
    outcome: TaskClaimOutcome;
    reason: string | null;
    task: AgentTaskRow | null;
}

/**
 * Claims every requested task in one transaction and answers per task. A
 * refusal is a row outcome, not a thrown error, so a batch never commits some
 * claims and then fails the request: every granted claim reaches the caller
 * and its `task.updated` event reaches the route.
 */
export async function claimAgentTasks(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { messageId?: string; numbers?: number[]; target: string }
) {
    const chatId = await resolveAgentTarget(db, runner, input.target);
    const messageId = input.messageId
        ? (await resolveAgentMessage(db, runner, input.messageId)).id
        : undefined;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        await requireChatWritable(tx, { chatId, serverId: runner.serverId });
        const events: ServerDurableEvent[] = [];
        const found = await queryAgentTasks(tx, runner, chatId, {
            messageId,
            numbers: input.numbers,
        });
        const outcomes: Array<Omit<TaskClaimResult, 'task'> & { messageId: string | null }> = [];
        if (found.length === 0 && messageId) {
            // `numbers` may have filtered out the message's own task; promoting
            // it again would violate the one-task-per-message key.
            const [existing] = await queryAgentTasks(tx, runner, chatId, { messageId });
            if (existing) {
                const claim = await claimTaskRow(tx, runner, existing.messageId);
                if (claim.event) {
                    events.push(claim.event);
                }
                outcomes.push(claim.outcome);
            } else {
                const promoted = await promoteAgentMessageTask(tx, runner, chatId, messageId);
                events.push(promoted.event);
                outcomes.push(grant(promoted.task, 'claimed'));
            }
        } else if (found.length === 0 && !input.numbers?.length) {
            throw new AgentTaskError('No matching task exists in that target.');
        }
        const byNumber = new Map(found.map((task) => [task.number, task]));
        const requested = input.numbers?.length
            ? [...new Set(input.numbers)]
            : found.map((task) => task.number);
        for (const number of requested) {
            const task = byNumber.get(number);
            if (!task) {
                outcomes.push(refuse(number, null, `No task #${number} exists in that target.`));
                continue;
            }
            const claim = await claimTaskRow(tx, runner, task.messageId);
            if (claim.event) {
                events.push(claim.event);
            }
            outcomes.push(claim.outcome);
        }
        const projections = await readTaskProjections(
            tx,
            runner,
            outcomes.flatMap((row) => row.messageId ?? [])
        );
        const results: TaskClaimResult[] = outcomes.map(({ messageId: id, ...row }) => ({
            ...row,
            task: id ? (projections.get(id) ?? null) : null,
        }));
        return { events, results };
    });
}

async function claimTaskRow(tx: HausDatabase, runner: ResolvedRunner, messageId: string) {
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
    if (current.assigneeAgentId === runner.agentId && current.claimedAt !== null) {
        await followClaimedTask(tx, runner, current);
        return { event: null, outcome: grant(current, 'already_yours') };
    }
    // Only the holder decides a claim. The row is locked under the Server
    // lock, so edits to status or labels since the caller last read the task
    // cannot make the claim stale.
    if (taskHasOtherOwnerForAgent(current, runner.agentId)) {
        const conflict = await buildTaskClaimConflict(tx, runner.serverId, current, new Date());
        return {
            event: null,
            outcome: {
                ...refuse(
                    current.number,
                    current.messageId,
                    'That task is already owned by another assignee.'
                ),
                claimConflict: conflict,
            },
        };
    }
    if (current.status === 'done') {
        return {
            event: null,
            outcome: refuse(current.number, current.messageId, 'Done tasks cannot be claimed.'),
        };
    }
    if (await hasUnseenTaskThreadContext(tx, runner, messageId)) {
        return {
            event: null,
            outcome: refuse(
                current.number,
                current.messageId,
                'New context exists in this task thread. Run haus message check before retrying.'
            ),
        };
    }
    await tx
        .update(messageTasksTable)
        .set({
            assigneeAgentId: runner.agentId,
            assigneeUserId: null,
            claimedAt: sql`now()`,
            status: current.status === 'todo' ? 'in_progress' : current.status,
            updatedAt: sql`now()`,
            version: sql`${messageTasksTable.version} + 1`,
        })
        .where(
            and(
                eq(messageTasksTable.serverId, runner.serverId),
                eq(messageTasksTable.messageId, messageId)
            )
        );
    await followClaimedTask(tx, runner, current);
    const event = await insertTaskEvent(tx, {
        chatId: current.chatId,
        messageId,
        serverId: runner.serverId,
        type: 'task.updated',
    });
    return { event, outcome: grant(current, 'claimed') };
}

async function promoteAgentMessageTask(
    tx: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    messageId: string
) {
    await requireTopLevelTaskChat(tx, runner, chatId);
    const [message] = await tx
        .select({ id: chatMessagesTable.id })
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
    const [numberedChat] = await tx
        .update(chatsTable)
        .set({ lastTaskNumber: sql`${chatsTable.lastTaskNumber} + 1` })
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
        .returning({ number: chatsTable.lastTaskNumber });
    if (!numberedChat) {
        throw new AgentTaskError('That task target no longer exists.');
    }
    const [task] = await tx
        .insert(messageTasksTable)
        .values({
            assigneeAgentId: runner.agentId,
            chatId,
            claimedAt: sql`now()`,
            createdByAgentId: runner.agentId,
            messageId,
            number: numberedChat.number,
            origin: 'claimed',
            serverId: runner.serverId,
            status: 'in_progress',
        })
        .returning();
    if (!task) {
        throw new Error('Task conversion did not persist.');
    }
    await followClaimedTask(tx, runner, task);
    const event = await insertTaskEvent(tx, {
        chatId,
        messageId,
        serverId: runner.serverId,
        type: 'task.created',
    });
    return { event, task };
}

async function followClaimedTask(tx: HausDatabase, runner: ResolvedRunner, task: TaskRecord) {
    await followInlineReplyForMessage(tx, {
        agentId: runner.agentId,
        chatId: task.chatId,
        messageId: task.messageId,
        serverId: runner.serverId,
    });
}

async function readTaskProjections(tx: HausDatabase, runner: ResolvedRunner, ids: string[]) {
    if (ids.length === 0) {
        return new Map<string, AgentTaskRow>();
    }
    const rows = await tx
        .select({ message: messageSelection, task: messageTasksTable })
        .from(messageTasksTable)
        .innerJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, messageTasksTable.serverId),
                eq(chatMessagesTable.id, messageTasksTable.messageId)
            )
        )
        .where(
            and(
                eq(messageTasksTable.serverId, runner.serverId),
                inArray(messageTasksTable.messageId, ids)
            )
        );
    const projected = await taskRows(tx, runner, rows);
    return new Map(rows.map((row, index) => [row.task.messageId, projected[index]]));
}

function grant(task: TaskRecord, outcome: 'already_yours' | 'claimed') {
    return {
        claimConflict: null,
        messageId: task.messageId,
        number: task.number,
        outcome,
        reason: null,
    };
}

function refuse(number: number, messageId: string | null, reason: string) {
    return {
        claimConflict: null as TaskClaimConflict | null,
        messageId,
        number,
        outcome: 'refused' as const,
        reason,
    };
}
