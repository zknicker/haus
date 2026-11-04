import { formatTaskKey, GENERAL_BOARD_KEY } from '@haus/api';
import { eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    boardColumnsTable,
    boardsTable,
    taskMessageLinksTable,
    tasksTable,
} from '../postgres/schema.ts';

type Tx = Pick<HausDatabase, 'insert' | 'select' | 'update'>;

interface DemoTask {
    assigneeAgentId: string;
    category: 'active' | 'todo';
    createdByAgentId?: string;
    createdByUserId?: string;
    /** The Message the work came from, shown in the Task's Mentioned in. */
    messageId: string;
    priority: 'high' | 'medium';
    title: string;
}

/**
 * Seeds the General board with demo Tasks, numbered from 1, each mentioned by the
 * Message it came from. The board's counter starts past them, or the first real
 * `task.create` collides with a seeded number.
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
            assigneeAgentId: task.assigneeAgentId,
            boardId,
            columnId: column.id,
            createdByAgentId: task.createdByAgentId,
            createdByUserId: task.createdByUserId,
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
    await tx
        .update(boardsTable)
        .set({ nextNumber: sql`${boardsTable.nextNumber} + ${rows.length}` })
        .where(eq(boardsTable.id, boardId));
}
