import type { TaskLink } from '@haus/api';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { taskMessageLinksTable, taskReminderLinksTable, tasksTable } from '../postgres/schema.ts';
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
 * `task://` link names a Task on the Server by id or short id. Unresolved candidates are
 * dropped and stay plain text; content is never rewritten. Every Task is
 * visible to every member and Agent, so no further access check applies.
 */
export async function resolveTaskReferences(
    db: Reader,
    input: { content: string; serverId: string }
): Promise<TaskMessageLink[]> {
    const links = await resolveTaskLinkRows(db, input);
    return links.map(({ ordinal, taskId, text }) => ({ ordinal, taskId, text }));
}

/**
 * The same resolution as the `taskLinks` a client renders, for text resolved
 * when read rather than recorded: a Task description (`task.get`).
 */
export async function resolveTaskLinks(
    db: Reader,
    input: { content: string; serverId: string }
): Promise<TaskLink[]> {
    const links = await resolveTaskLinkRows(db, input);
    return links.map(({ shortId, taskId, text }) => ({ shortId, taskId, text }));
}

async function resolveTaskLinkRows(db: Reader, input: { content: string; serverId: string }) {
    const candidates = readTaskReferenceCandidates(input.content)
        .filter((candidate) => candidate.text.length <= maxLinkTextChars)
        .slice(0, maxCandidates);
    if (candidates.length === 0) {
        return [];
    }
    const refs = candidates.map((candidate) => candidate.taskId);
    const rows = await db
        .select({ id: tasksTable.id, shortId: tasksTable.shortId })
        .from(tasksTable)
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                or(inArray(tasksTable.id, refs), inArray(tasksTable.shortId, refs))
            )
        );
    const byRef = new Map(
        rows.flatMap((row) => [[row.id, row] as const, [row.shortId, row] as const])
    );
    return candidates
        .flatMap((candidate) => {
            const task = byRef.get(candidate.taskId);
            return task ? [{ shortId: task.shortId, taskId: task.id, text: candidate.text }] : [];
        })
        .map((link, ordinal) => ({ ...link, ordinal }));
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
            chatId: tasksTable.chatId,
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
            messageId: taskMessageLinksTable.messageId,
            shortId: tasksTable.shortId,
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
        .where(
            and(
                eq(taskMessageLinksTable.serverId, serverId),
                inArray(taskMessageLinksTable.messageId, [...messageIds])
            )
        )
        .orderBy(asc(taskMessageLinksTable.messageId), asc(taskMessageLinksTable.ordinal));
    const byMessage = new Map<string, TaskLink[]>();
    for (const row of rows) {
        const link = { shortId: row.shortId, taskId: row.taskId, text: row.text };
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
