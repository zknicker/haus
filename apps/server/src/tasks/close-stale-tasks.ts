import { type ServerDurableEvent, TASK_IN_REVIEW_STALE_DAYS } from '@haus/api';
import { and, eq, lt, sql } from 'drizzle-orm';
import { type BootSweep, type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageTasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { insertTaskEvent } from './task-events.ts';

const sweepIntervalMs = 60 * 60 * 1000;
const staleMs = TASK_IN_REVIEW_STALE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Closes every `in_review` task nobody has touched for the stale window: the
 * task row itself unchanged, and its inline reply chain and anchored Thread
 * without a new message. Review that went quiet is finished work
 * nobody said so about, and `closed` is reversible: a human reopens it through
 * the ordinary update path.
 *
 * Each close takes the same path a human update does — Server row lock, task
 * row lock, version bump, `task.updated` — so App caches invalidate exactly as
 * they do for an operator's change. Neither `message_tasks` nor the task events
 * carry an actor or a reason, so a stale close is indistinguishable from any
 * other close; nothing here invents a field to say otherwise.
 */
export async function closeStaleInReviewTasks(
    db: HausDatabase,
    now: Date
): Promise<ServerDurableEvent[]> {
    const quietBefore = new Date(now.getTime() - staleMs);
    const candidates = await db
        .select({
            chatId: messageTasksTable.chatId,
            messageId: messageTasksTable.messageId,
            serverId: messageTasksTable.serverId,
        })
        .from(messageTasksTable)
        .where(staleTaskFilter(quietBefore));
    const events: ServerDurableEvent[] = [];
    for (const candidate of candidates) {
        const event = await closeStaleTask(db, candidate, { now, quietBefore });
        if (event) {
            events.push(event);
        }
    }
    for (const event of events) {
        emitDurableChatEvent({ audienceUserId: null, event });
    }
    return events;
}

/** Runs the stale close on boot and hourly after that. */
export function startStaleTaskSweep(
    db: HausDatabase,
    clock: { now(): Date },
    timers?: SweepTimers
): BootSweep {
    return startBootSweep({
        intervalMs: sweepIntervalMs,
        name: 'stale in-review task sweep',
        run: () => closeStaleInReviewTasks(db, clock.now()),
        timers,
    });
}

async function closeStaleTask(
    db: HausDatabase,
    task: { chatId: string; messageId: string; serverId: string },
    window: { now: Date; quietBefore: Date }
): Promise<ServerDurableEvent | null> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, task.serverId);
        await tx.execute(sql`
            select message_id from message_tasks
            where server_id = ${task.serverId} and message_id = ${task.messageId}
            for update
        `);
        // Re-read under the lock: a reply or an operator edit between the
        // candidate scan and this transaction takes the task out of scope.
        const [current] = await tx
            .select({ messageId: messageTasksTable.messageId })
            .from(messageTasksTable)
            .where(
                and(
                    eq(messageTasksTable.serverId, task.serverId),
                    eq(messageTasksTable.messageId, task.messageId),
                    staleTaskFilter(window.quietBefore)
                )
            )
            .limit(1);
        if (!current) {
            return null;
        }
        await tx
            .update(messageTasksTable)
            .set({
                status: 'closed',
                updatedAt: window.now,
                version: sql`${messageTasksTable.version} + 1`,
            })
            .where(
                and(
                    eq(messageTasksTable.serverId, task.serverId),
                    eq(messageTasksTable.messageId, task.messageId)
                )
            );
        return await insertTaskEvent(tx, {
            chatId: task.chatId,
            messageId: task.messageId,
            serverId: task.serverId,
            type: 'task.updated',
        });
    });
}

function staleTaskFilter(quietBefore: Date) {
    return and(
        eq(messageTasksTable.status, 'in_review'),
        lt(messageTasksTable.updatedAt, quietBefore),
        sql`not exists (
            select 1 from chat_messages inline_message
            join chat_messages task_message
              on task_message.server_id = ${messageTasksTable.serverId}
             and task_message.id = ${messageTasksTable.messageId}
            where inline_message.server_id = ${messageTasksTable.serverId}
              and inline_message.chat_id = ${messageTasksTable.chatId}
              and inline_message.reply_to_message_id is not null
              and inline_message.reply_root_message_id = coalesce(
                  task_message.reply_root_message_id, task_message.id
              )
              and inline_message.created_at >= ${quietBefore}
        )`,
        sql`not exists (
            select 1
            from chat_messages stale_message
            join chats stale_thread
              on stale_thread.server_id = stale_message.server_id
             and stale_thread.id = stale_message.chat_id
            where stale_thread.server_id = ${messageTasksTable.serverId}
              and stale_thread.kind = 'thread'
              and stale_thread.parent_chat_id = ${messageTasksTable.chatId}
              and stale_thread.anchor_message_id = ${messageTasksTable.messageId}
              and stale_message.created_at >= ${quietBefore}
        )`
    );
}
