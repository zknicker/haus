import type {
    ChatMessage,
    TaskInboxItem,
    TaskInboxMutationResult,
    TaskMessagePlace,
} from '@haus/api';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { readMessagesById } from '../chats/read-messages-by-id.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    boardsTable,
    chatMessagesTable,
    chatsTable,
    taskInboxItemsTable,
    taskMessageLinksTable,
    tasksTable,
    usersTable,
} from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { requireServerMembership, ServerAccessDeniedError } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { actorVisibleChats } from './actor-visible-chats.ts';
import type { TaskActor } from './task-actor.ts';
import {
    clearTaskInboxItem,
    prepareTaskInboxChangedEvent,
    restoreTaskInboxItem,
} from './task-inbox-items.ts';
import { messagePlaceColumns, messagePlaceOf, threadParentChatJoin } from './task-message-place.ts';
import { readTasks } from './task-read.ts';

interface InboxTaskKey {
    serverId: string;
    taskId: string;
}

/**
 * `taskInbox.list`: the reader's uncleared Task items on one Server, newest
 * assignment first (ADR 0051). Each carries its context message, the newest
 * message referencing the Task that the reader can read, projected the way the
 * transcript projects it, and where that message lives. Every part is one
 * batched read.
 */
export async function listTaskInbox(
    db: HausDatabase,
    member: HausUser | null,
    serverId: string
): Promise<TaskInboxItem[]> {
    const userId = await requireReader(db, member, serverId);
    const items = await db
        .select()
        .from(taskInboxItemsTable)
        .where(
            and(
                eq(taskInboxItemsTable.serverId, serverId),
                eq(taskInboxItemsTable.userId, userId),
                isNull(taskInboxItemsTable.clearedAt)
            )
        )
        .orderBy(desc(taskInboxItemsTable.createdAt), asc(taskInboxItemsTable.taskId));
    if (items.length === 0) {
        return [];
    }
    const taskIds = items.map((item) => item.taskId);
    const tasks = await readTasks(db, { serverId, where: inArray(tasksTable.id, taskIds) });
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const boards = await db
        .select({ id: boardsTable.id, name: boardsTable.name })
        .from(boardsTable)
        .where(eq(boardsTable.serverId, serverId));
    const boardName = new Map(boards.map((board) => [board.id, board.name]));
    const labels = await readAssignerLabels(db, serverId, items);
    const contexts = await readContextMessages(db, { kind: 'user', userId }, { serverId, taskIds });
    return items.map((item) => {
        const task = taskById.get(item.taskId);
        const name = task && boardName.get(task.boardId);
        if (!(task && name)) {
            throw new Error(`Task Inbox item for ${item.taskId} did not resolve its Task.`);
        }
        const { assignedByAgentId: agentId, assignedByUserId } = item;
        const id = agentId ?? assignedByUserId;
        if (!id) {
            throw new Error(`Task Inbox item for ${item.taskId} names no assigner.`);
        }
        const context = contexts.get(item.taskId);
        return {
            assignedAt: item.createdAt.toISOString(),
            assignedBy: {
                id,
                kind: agentId ? ('agent' as const) : ('user' as const),
                label: labels.get(id) ?? 'Unknown',
            },
            boardName: name,
            contextMessage: context?.message ?? null,
            contextPlace: context?.place ?? null,
            task,
        };
    });
}

/** `taskInbox.clear`: Mark read, or opening the Task. */
export async function clearTaskInbox(
    db: HausDatabase,
    member: HausUser | null,
    input: InboxTaskKey
) {
    return await changeTaskInbox(db, member, input, clearTaskInboxItem);
}

/** `taskInbox.restore`: undo a clear. */
export async function restoreTaskInbox(
    db: HausDatabase,
    member: HausUser | null,
    input: InboxTaskKey
) {
    return await changeTaskInbox(db, member, input, restoreTaskInboxItem);
}

async function changeTaskInbox(
    db: HausDatabase,
    member: HausUser | null,
    input: InboxTaskKey,
    change: typeof clearTaskInboxItem
): Promise<TaskInboxMutationResult & { event: PreparedRealtimeEvent | null }> {
    const userId = await requireReader(db, member, input.serverId);
    const changed = await change(db, { ...input, userId });
    return {
        changed,
        event: changed ? prepareTaskInboxChangedEvent({ serverId: input.serverId, userId }) : null,
    };
}

/** Only a signed-in member of the Server has a Task Inbox there. */
async function requireReader(
    db: Pick<HausDatabase, 'select'>,
    member: HausUser | null,
    serverId: string
): Promise<string> {
    await requireServerMembership(db, member, serverId);
    if (!member) {
        throw new ServerAccessDeniedError();
    }
    return member.id;
}

async function readAssignerLabels(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    items: readonly { assignedByAgentId: string | null; assignedByUserId: string | null }[]
): Promise<Map<string, string>> {
    const agentIds = items.flatMap((item) => item.assignedByAgentId ?? []);
    const userIds = items.flatMap((item) => item.assignedByUserId ?? []);
    const agents =
        agentIds.length === 0
            ? []
            : await db
                  .select({ id: agentsTable.id, label: agentsTable.displayName })
                  .from(agentsTable)
                  .where(
                      and(eq(agentsTable.serverId, serverId), inArray(agentsTable.id, agentIds))
                  );
    const users =
        userIds.length === 0
            ? []
            : await db
                  .select({ id: usersTable.id, label: usersTable.displayName })
                  .from(usersTable)
                  .where(inArray(usersTable.id, userIds));
    return new Map(
        [...agents, ...users].flatMap((row) => (row.label ? [[row.id, row.label] as const] : []))
    );
}

/**
 * Each Task's newest readable referencing message and its place, in one read
 * of the links and one projection.
 */
async function readContextMessages(
    db: HausDatabase,
    reader: TaskActor,
    input: { serverId: string; taskIds: string[] }
): Promise<Map<string, { message: ChatMessage; place: TaskMessagePlace }>> {
    const links = await db
        .selectDistinctOn([taskMessageLinksTable.taskId], {
            ...messagePlaceColumns,
            messageId: taskMessageLinksTable.messageId,
            taskId: taskMessageLinksTable.taskId,
        })
        .from(taskMessageLinksTable)
        .innerJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, taskMessageLinksTable.serverId),
                eq(chatMessagesTable.id, taskMessageLinksTable.messageId)
            )
        )
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, chatMessagesTable.serverId),
                eq(chatsTable.id, chatMessagesTable.chatId)
            )
        )
        .leftJoin(...threadParentChatJoin)
        .where(
            and(
                eq(taskMessageLinksTable.serverId, input.serverId),
                inArray(taskMessageLinksTable.taskId, input.taskIds),
                isNull(chatsTable.deletedAt),
                actorVisibleChats(reader)
            )
        )
        .orderBy(
            taskMessageLinksTable.taskId,
            desc(chatMessagesTable.createdAt),
            desc(chatMessagesTable.id)
        );
    const messages = await readMessagesById(
        db,
        input.serverId,
        links.map((link) => link.messageId)
    );
    return new Map(
        links.flatMap((link) => {
            const message = messages.get(link.messageId);
            return message
                ? [[link.taskId, { message, place: messagePlaceOf(link) }] as const]
                : [];
        })
    );
}
