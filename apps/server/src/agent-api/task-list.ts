import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable, messageTasksTable } from '../postgres/schema.ts';
import { messageSelection, visibleChatSql } from './message-view.ts';
import { resolveAgentTarget } from './resolve-target.ts';
import { taskRows } from './task-row.ts';

export const TASK_LIST_STATUSES = [
    'all',
    'todo',
    'in_progress',
    'in_review',
    'done',
    'closed',
] as const;
export type TaskListStatus = (typeof TASK_LIST_STATUSES)[number];

/** Unfinished work is what an Agent lists to decide what to pick up next. */
const unfinishedStatuses = ['todo', 'in_progress', 'in_review'] as const;
export const TASK_LIST_LIMIT = 50;

export async function listAgentTasks(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { mine?: boolean; status?: TaskListStatus; target?: string }
) {
    const chatId = input.target ? await resolveAgentTarget(db, runner, input.target) : null;
    const where = and(
        eq(messageTasksTable.serverId, runner.serverId),
        chatId ? eq(messageTasksTable.chatId, chatId) : visibleChatSql(runner),
        statusFilter(input.status),
        input.mine ? eq(messageTasksTable.assigneeAgentId, runner.agentId) : undefined
    );
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
        .where(where)
        .orderBy(desc(messageTasksTable.updatedAt))
        .limit(TASK_LIST_LIMIT + 1);
    const truncated = rows.length > TASK_LIST_LIMIT;
    const page = rows.slice(0, TASK_LIST_LIMIT);
    return {
        omitted: truncated ? (await countTasks(db, where)) - page.length : 0,
        tasks: await taskRows(db, runner, page),
    };
}

function statusFilter(status: TaskListStatus | undefined) {
    if (status === 'all') {
        return undefined;
    }
    return status
        ? eq(messageTasksTable.status, status)
        : inArray(messageTasksTable.status, [...unfinishedStatuses]);
}

async function countTasks(db: HausDatabase, where: ReturnType<typeof and>) {
    const [row] = await db
        .select({ total: count() })
        .from(messageTasksTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, messageTasksTable.serverId),
                eq(chatsTable.id, messageTasksTable.chatId)
            )
        )
        .where(where);
    return row?.total ?? 0;
}
