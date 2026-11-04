import { formatTaskKey, type TaskLink } from '@haus/api';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    boardsTable,
    taskMessageLinksTable,
    taskReminderLinksTable,
    tasksTable,
} from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { prepareTaskUpdatedEvent } from './task-events.ts';
import { readTaskReferenceCandidates } from './task-reference-scan.ts';

type Reader = Pick<HausDatabase, 'select'>;

/** One resolved Task reference in a Message, in content order. */
export interface TaskMessageLink {
    ordinal: number;
    taskId: string;
    text: string;
}

const maxCandidates = 100;
const maxLinkTextChars = 500;

/**
 * Resolves the Task references in written content against one Server: a
 * `task://` id must name a Task on the Server, and a bare key must match a
 * board key and number there. Unresolved candidates are dropped and stay plain
 * text; content is never rewritten. Every Task is visible to every member and
 * Agent, so no further access check applies.
 */
export async function resolveTaskReferences(
    db: Reader,
    input: { content: string; serverId: string }
): Promise<TaskMessageLink[]> {
    const candidates = readTaskReferenceCandidates(input.content)
        .filter((candidate) => candidate.text.length <= maxLinkTextChars)
        .slice(0, maxCandidates);
    if (candidates.length === 0) {
        return [];
    }
    const ids = candidates.flatMap((candidate) =>
        candidate.kind === 'id' ? [candidate.taskId] : []
    );
    const keys = candidates.flatMap((candidate) => (candidate.kind === 'key' ? [candidate] : []));
    const rows = await db
        .select({ boardKey: boardsTable.key, id: tasksTable.id, number: tasksTable.number })
        .from(tasksTable)
        .innerJoin(
            boardsTable,
            and(
                eq(boardsTable.serverId, tasksTable.serverId),
                eq(boardsTable.id, tasksTable.boardId)
            )
        )
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                or(
                    ids.length > 0 ? inArray(tasksTable.id, ids) : undefined,
                    ...keys.map((key) =>
                        and(eq(boardsTable.key, key.boardKey), eq(tasksTable.number, key.number))
                    )
                )
            )
        );
    const byId = new Set(rows.map((row) => row.id));
    const byKey = new Map(rows.map((row) => [formatTaskKey(row.boardKey, row.number), row.id]));
    const links: TaskMessageLink[] = [];
    for (const candidate of candidates) {
        const taskId =
            candidate.kind === 'id'
                ? byId.has(candidate.taskId)
                    ? candidate.taskId
                    : undefined
                : byKey.get(formatTaskKey(candidate.boardKey, candidate.number));
        if (taskId) {
            links.push({ ordinal: links.length, taskId, text: candidate.text });
        }
    }
    return links;
}

/** Inserts one Message's Task links inside the transaction that inserts the Message. */
export async function recordTaskMessageLinks(
    tx: Pick<HausDatabase, 'insert'>,
    input: { links: readonly TaskMessageLink[]; messageId: string; serverId: string }
): Promise<void> {
    if (input.links.length === 0) {
        return;
    }
    await tx.insert(taskMessageLinksTable).values(
        input.links.map((link) => ({
            messageId: input.messageId,
            ordinal: link.ordinal,
            serverId: input.serverId,
            taskId: link.taskId,
            text: link.text,
        }))
    );
}

/**
 * One `task.updated` per Task whose Mentioned in or Reminders just changed, at the
 * Task's current version: the record did not change, but an open Task must refetch.
 */
export async function prepareTaskLinkEvents(
    db: Reader,
    input: { serverId: string; taskIds: readonly string[] }
): Promise<PreparedRealtimeEvent[]> {
    if (input.taskIds.length === 0) {
        return [];
    }
    const tasks = await db
        .select({
            boardId: tasksTable.boardId,
            id: tasksTable.id,
            serverId: tasksTable.serverId,
            version: tasksTable.version,
        })
        .from(tasksTable)
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                inArray(tasksTable.id, [...new Set(input.taskIds)])
            )
        );
    return tasks.map(prepareTaskUpdatedEvent);
}

/** Each Message's `taskLinks`, keyed by the Tasks' current board keys, in content order. */
export async function readMessageTaskLinks(
    db: Reader,
    serverId: string,
    messageIds: readonly string[]
): Promise<Map<string, TaskLink[]>> {
    if (messageIds.length === 0) {
        return new Map();
    }
    const rows = await db
        .select({
            boardKey: boardsTable.key,
            messageId: taskMessageLinksTable.messageId,
            number: tasksTable.number,
            taskId: taskMessageLinksTable.taskId,
            text: taskMessageLinksTable.text,
        })
        .from(taskMessageLinksTable)
        .innerJoin(
            tasksTable,
            and(
                eq(tasksTable.serverId, taskMessageLinksTable.serverId),
                eq(tasksTable.id, taskMessageLinksTable.taskId)
            )
        )
        .innerJoin(
            boardsTable,
            and(
                eq(boardsTable.serverId, tasksTable.serverId),
                eq(boardsTable.id, tasksTable.boardId)
            )
        )
        .where(
            and(
                eq(taskMessageLinksTable.serverId, serverId),
                inArray(taskMessageLinksTable.messageId, [...messageIds])
            )
        )
        .orderBy(asc(taskMessageLinksTable.messageId), asc(taskMessageLinksTable.ordinal));
    const byMessage = new Map<string, TaskLink[]>();
    for (const row of rows) {
        const link = {
            key: formatTaskKey(row.boardKey, row.number),
            taskId: row.taskId,
            text: row.text,
        };
        byMessage.set(row.messageId, [...(byMessage.get(row.messageId) ?? []), link]);
    }
    return byMessage;
}

/**
 * Re-records which Tasks a Reminder's description references (its Task's
 * **Reminders**). Runs on Reminder create and update, in that transaction. An
 * `undefined` description is a change that left it alone (a snooze), which
 * keeps the links it already resolved. Returns the Tasks it unlinked or relinked,
 * which `prepareReminderEvents` announces beside the links that stand now.
 */
export async function recordTaskReminderLinks(
    tx: Pick<HausDatabase, 'delete' | 'insert' | 'select'>,
    input: { description: string | null | undefined; reminderId: string; serverId: string }
): Promise<string[]> {
    if (input.description === undefined) {
        return [];
    }
    const former = await tx
        .delete(taskReminderLinksTable)
        .where(
            and(
                eq(taskReminderLinksTable.serverId, input.serverId),
                eq(taskReminderLinksTable.reminderId, input.reminderId)
            )
        )
        .returning({ taskId: taskReminderLinksTable.taskId });
    const formerTaskIds = former.map((link) => link.taskId);
    if (!input.description) {
        return formerTaskIds;
    }
    const links = await resolveTaskReferences(tx, {
        content: input.description,
        serverId: input.serverId,
    });
    const taskIds = [...new Set(links.map((link) => link.taskId))];
    if (taskIds.length > 0) {
        await tx.insert(taskReminderLinksTable).values(
            taskIds.map((taskId) => ({
                reminderId: input.reminderId,
                serverId: input.serverId,
                taskId,
            }))
        );
    }
    return formerTaskIds;
}

/** The Tasks the named Reminders reference now. */
export async function readReminderTaskIds(
    db: Reader,
    input: { reminderIds: readonly string[]; serverId: string }
): Promise<string[]> {
    if (input.reminderIds.length === 0) {
        return [];
    }
    const links = await db
        .select({ taskId: taskReminderLinksTable.taskId })
        .from(taskReminderLinksTable)
        .where(
            and(
                eq(taskReminderLinksTable.serverId, input.serverId),
                inArray(taskReminderLinksTable.reminderId, [...input.reminderIds])
            )
        );
    return links.map((link) => link.taskId);
}
