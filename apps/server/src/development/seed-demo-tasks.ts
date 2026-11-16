import { formatTaskKey, GENERAL_BOARD_KEY, type TaskActor } from '@haus/api';
import { eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    boardColumnsTable,
    boardsTable,
    taskInboxItemsTable,
    taskMessageLinksTable,
    tasksTable,
} from '../postgres/schema.ts';

type Tx = Pick<HausDatabase, 'insert' | 'select' | 'update'>;

interface DemoTask {
    assignee: TaskActor;
    category: 'active' | 'todo';
    createdBy: TaskActor;
    /** The Message the work came from, shown in the Task's Mentioned in. */
    messageId: string;
    priority: 'high' | 'medium';
    title: string;
}

/**
 * Seeds the General board with demo Tasks, numbered from 1, each mentioned by the
 * Message it came from. A Task assigned to a person is that person's Inbox item,
 * so a fresh dev stack shows the Inbox card, the chip, and Mentioned in. The
 * board's counter starts past them, or the first real `task.create` collides
 * with a seeded number.
 */
export async function seedDemoTasks(
    tx: Tx,
    input: { boardId: string; serverId: string; tasks: readonly DemoTask[] }
): Promise<void> {
    const { boardId, serverId } = input;
    const columns = await tx
        .select({ category: boardColumnsTable.category, id: boardColumnsTable.id })
        .from(boardColumnsTable)
        .where(eq(boardColumnsTable.boardId, boardId));
    const rows = input.tasks.map((task, index) => {
        const column = columns.find((candidate) => candidate.category === task.category);
        if (!column) {
            throw new Error(`The General board has no ${task.category} column.`);
        }
        return { column, id: createOpaqueId('tsk'), number: index + 1, task };
    });
    await tx.insert(tasksTable).values(
        rows.map(({ column, id, number, task }) => ({
            assigneeAgentId: agentIdOf(task.assignee),
            assigneeUserId: userIdOf(task.assignee),
            boardId,
            columnId: column.id,
            createdByAgentId: agentIdOf(task.createdBy),
            createdByUserId: userIdOf(task.createdBy),
            id,
            number,
            priority: task.priority,
            serverId,
            title: task.title,
        }))
    );
    await tx.insert(taskMessageLinksTable).values(
        rows.map(({ id, number, task }) => ({
            messageId: task.messageId,
            ordinal: 0,
            serverId,
            taskId: id,
            text: formatTaskKey(GENERAL_BOARD_KEY, number),
        }))
    );
    const inboxItems = rows.flatMap(({ id, task }) => {
        const userId = userIdOf(task.assignee);
        return userId
            ? [
                  {
                      assignedByAgentId: agentIdOf(task.createdBy),
                      assignedByUserId: userIdOf(task.createdBy),
                      assignmentVersion: 1,
                      serverId,
                      taskId: id,
                      userId,
                  },
              ]
            : [];
    });
    if (inboxItems.length > 0) {
        await tx.insert(taskInboxItemsTable).values(inboxItems);
    }
    await tx
        .update(boardsTable)
        .set({ nextNumber: sql`${boardsTable.nextNumber} + ${rows.length}` })
        .where(eq(boardsTable.id, boardId));
}

function agentIdOf(actor: TaskActor) {
    return actor.kind === 'agent' ? actor.agentId : null;
}

function userIdOf(actor: TaskActor) {
    return actor.kind === 'user' ? actor.userId : null;
}
