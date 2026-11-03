import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, messageTasksTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { anchorMessageIdForThreadChatId } from '../threads/thread-id.ts';
import { prepareTaskEvent } from './task-events.ts';

type TaskWriter = Pick<HausDatabase, 'insert' | 'select' | 'update'>;

interface RunScope {
    agentId: string;
    runId: string;
    serverId: string;
}

/**
 * Records the Agent's outstanding background claims when its run settles.
 *
 * A background claim is a lock the Agent took to do work inside one turn. A
 * settled run never proves that the work is finished: only the Agent's explicit
 * `done` mutation can close it. Any still-open claim is stamped tracked so a
 * person can see work that outlived the run.
 *
 * Each changed claim emits `task.updated`, as does the liveness edge every
 * settling run crosses, so no client polls for either.
 */
export async function settleAgentBackgroundClaims(
    db: TaskWriter,
    scope: RunScope
): Promise<PreparedRealtimeEvent[]> {
    const candidates = await db
        .select()
        .from(messageTasksTable)
        .where(
            and(
                eq(messageTasksTable.serverId, scope.serverId),
                eq(messageTasksTable.assigneeAgentId, scope.agentId),
                eq(messageTasksTable.origin, 'claimed'),
                eq(messageTasksTable.status, 'in_progress'),
                isNull(messageTasksTable.trackedAt)
            )
        );
    const changed = new Map<
        string,
        { chatId: string; messageId: string; threadChatId: string | null }
    >();
    for (const task of candidates) {
        await db
            .update(messageTasksTable)
            .set({
                trackedAt: sql`now()`,
                updatedAt: sql`now()`,
                version: sql`${messageTasksTable.version} + 1`,
            })
            .where(
                and(
                    eq(messageTasksTable.serverId, scope.serverId),
                    eq(messageTasksTable.messageId, task.messageId)
                )
            );
        changed.set(task.messageId, task);
    }
    for (const held of await tasksHeldByRun(db, scope)) {
        changed.set(held.messageId, held);
    }
    return [...changed.values()].map((task) => taskUpdatedEvent(scope, task));
}

/** `task.updated` for every task this run holds — the liveness edge, either way. */
export async function runLivenessTaskEvents(
    db: TaskWriter,
    scope: RunScope
): Promise<PreparedRealtimeEvent[]> {
    return (await tasksHeldByRun(db, scope)).map((task) => taskUpdatedEvent(scope, task));
}

function taskUpdatedEvent(
    scope: RunScope,
    task: { chatId: string; messageId: string; threadChatId: string | null }
) {
    return prepareTaskEvent({
        chatId: task.chatId,
        messageId: task.messageId,
        serverId: scope.serverId,
        threadChatId: task.threadChatId,
        type: 'task.updated',
    });
}

/**
 * The tasks this run's inbox rows anchor on, by message or by Thread. A Thread
 * row holds both the task on the Thread's anchor and every task posted inside
 * that Thread: the Thread is their shared work surface.
 */
async function tasksHeldByRun(db: TaskWriter, scope: RunScope) {
    const rows = await db
        .select({ chatId: agentInboxTable.chatId, dedupeKey: agentInboxTable.dedupeKey })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, scope.serverId),
                eq(agentInboxTable.agentId, scope.agentId),
                ne(agentInboxTable.state, 'seen'),
                or(
                    eq(agentInboxTable.runId, scope.runId),
                    eq(agentInboxTable.noticeRunId, scope.runId)
                )
            )
        );
    if (rows.length === 0) {
        return [];
    }
    const anchors = new Set<string>();
    const threadChatIds = new Set<string>();
    for (const row of rows) {
        anchors.add(row.dedupeKey);
        const threadAnchor = row.chatId ? anchorMessageIdForThreadChatId(row.chatId) : null;
        if (row.chatId && threadAnchor) {
            anchors.add(threadAnchor);
            threadChatIds.add(row.chatId);
        }
    }
    return await db
        .select({
            chatId: messageTasksTable.chatId,
            messageId: messageTasksTable.messageId,
            threadChatId: messageTasksTable.threadChatId,
        })
        .from(messageTasksTable)
        .where(
            and(
                eq(messageTasksTable.serverId, scope.serverId),
                threadChatIds.size > 0
                    ? or(
                          inArray(messageTasksTable.messageId, [...anchors]),
                          inArray(messageTasksTable.threadChatId, [...threadChatIds])
                      )
                    : inArray(messageTasksTable.messageId, [...anchors])
            )
        );
}
