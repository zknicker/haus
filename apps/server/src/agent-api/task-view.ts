import type { Board, HausApiSchema, Task, TaskActor, TaskDetail } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    remindersTable,
    serverMembershipsTable,
    taskLabelAssignmentsTable,
    taskLabelsTable,
} from '../postgres/schema.ts';
import { targetForChat } from './message-view.ts';
import { requireBoardById } from './task-refs.ts';

type AgentTaskRow = HausApiSchema<'AgentTaskRow'>;
type Reader = Pick<HausDatabase, 'select'>;

/** A board as the Agent API shapes it: the fields an Agent acts on, without the Server's own. */
export function toAgentBoard(board: Board): HausApiSchema<'AgentBoard'> {
    const { archivedAt, columns, id, key, name, openTaskCount, version } = board;
    return { archivedAt, columns, id, key, name, openTaskCount, version };
}

/** Tasks as Agent API rows: handles for ids, label and column names, in a few batched reads. */
export async function toAgentTaskRows(
    db: Reader,
    serverId: string,
    tasks: readonly Task[],
    boards: readonly Board[]
): Promise<AgentTaskRow[]> {
    const actors = tasks.flatMap((task) => [
        task.createdBy,
        ...(task.assignee ? [task.assignee] : []),
    ]);
    const handles = await readActorHandles(db, serverId, actors);
    const labels = await readTaskLabelNames(
        db,
        serverId,
        tasks.map((task) => task.id)
    );
    return tasks.map((task) => {
        const board = requireBoardById(boards, task.boardId);
        const column = board.columns.find((candidate) => candidate.id === task.columnId);
        if (!column) {
            throw new Error(`Task ${task.key} sits in a column its board does not have.`);
        }
        return {
            assignee: task.assignee ? actorRow(task.assignee, handles) : null,
            board: board.key,
            category: task.category,
            column: column.name,
            columnId: task.columnId,
            completedAt: task.completedAt,
            createdAt: task.createdAt,
            createdBy: actorRow(task.createdBy, handles),
            dueOn: task.dueOn,
            key: task.key,
            labels: labels.get(task.id) ?? [],
            priority: task.priority,
            title: task.title,
            updatedAt: task.updatedAt,
            version: task.version,
        };
    });
}

/** `haus task show`'s body beside the row: where each mention and Reminder lives, as targets. */
export async function toAgentTaskRefs(db: HausDatabase, detail: TaskDetail) {
    const { serverId } = detail;
    const chatIds = new Set([
        ...detail.mentions.map((mention) => mention.chatId),
        ...detail.reminders.map((reminder) => reminder.anchorChatId),
    ]);
    const targets = new Map<string, string>();
    for (const chatId of chatIds) {
        targets.set(chatId, await targetForChat(db, serverId, chatId));
    }
    const reminderIds = detail.reminders.map((reminder) => reminder.reminderId);
    const repeats =
        reminderIds.length === 0
            ? []
            : await db
                  .select({ id: remindersTable.id, repeat: remindersTable.repeat })
                  .from(remindersTable)
                  .where(
                      and(
                          eq(remindersTable.serverId, serverId),
                          inArray(remindersTable.id, reminderIds)
                      )
                  );
    const repeatById = new Map(repeats.map((row) => [row.id, row.repeat]));
    return {
        mentions: detail.mentions.map((mention) => ({
            author: mention.authorLabel,
            createdAt: mention.createdAt,
            excerpt: mention.excerpt,
            messageId: mention.messageId,
            target: targets.get(mention.chatId) ?? '#unknown',
        })),
        reminders: detail.reminders.map((reminder) => ({
            anchorTarget: targets.get(reminder.anchorChatId) ?? '#unknown',
            id: reminder.reminderId,
            nextFireAt: reminder.nextFireAt,
            repeat: repeatById.get(reminder.reminderId) ?? null,
            title: reminder.title,
        })),
    };
}

function actorRow(actor: TaskActor, handles: Map<string, string | null>) {
    return actor.kind === 'agent'
        ? { handle: handles.get(actor.agentId) ?? null, type: 'agent' as const }
        : { handle: handles.get(actor.userId) ?? null, type: 'human' as const };
}

async function readActorHandles(db: Reader, serverId: string, actors: readonly TaskActor[]) {
    const agentIds = actors.flatMap((actor) => (actor.kind === 'agent' ? [actor.agentId] : []));
    const userIds = actors.flatMap((actor) => (actor.kind === 'user' ? [actor.userId] : []));
    const agents =
        agentIds.length === 0
            ? []
            : await db
                  .select({ handle: agentsTable.handle, id: agentsTable.id })
                  .from(agentsTable)
                  .where(
                      and(eq(agentsTable.serverId, serverId), inArray(agentsTable.id, agentIds))
                  );
    const humans =
        userIds.length === 0
            ? []
            : await db
                  .select({
                      handle: serverMembershipsTable.handle,
                      id: serverMembershipsTable.userId,
                  })
                  .from(serverMembershipsTable)
                  .where(
                      and(
                          eq(serverMembershipsTable.serverId, serverId),
                          inArray(serverMembershipsTable.userId, userIds)
                      )
                  );
    return new Map<string, string | null>(
        [...agents, ...humans].map((row) => [row.id, row.handle])
    );
}

async function readTaskLabelNames(db: Reader, serverId: string, taskIds: string[]) {
    if (taskIds.length === 0) {
        return new Map<string, string[]>();
    }
    const rows = await db
        .select({ name: taskLabelsTable.name, taskId: taskLabelAssignmentsTable.taskId })
        .from(taskLabelAssignmentsTable)
        .innerJoin(
            taskLabelsTable,
            and(
                eq(taskLabelsTable.serverId, taskLabelAssignmentsTable.serverId),
                eq(taskLabelsTable.id, taskLabelAssignmentsTable.labelId)
            )
        )
        .where(
            and(
                eq(taskLabelAssignmentsTable.serverId, serverId),
                inArray(taskLabelAssignmentsTable.taskId, taskIds)
            )
        )
        .orderBy(taskLabelsTable.name);
    const byTask = new Map<string, string[]>();
    for (const row of rows) {
        byTask.set(row.taskId, [...(byTask.get(row.taskId) ?? []), row.name]);
    }
    return byTask;
}
