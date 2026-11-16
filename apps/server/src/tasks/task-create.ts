import {
    formatTaskKey,
    isClosedColumnCategory,
    TASK_DESCRIPTION_MAX_CHARS,
    type TaskCreateInput,
} from '@haus/api';
import { and, asc, eq, sql } from 'drizzle-orm';
import { lockBoard } from '../boards/board-read.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    boardColumnsTable,
    boardsTable,
    taskMessageLinksTable,
    tasksTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { creatorColumns, requireTaskActor, type TaskActor } from './task-actor.ts';
import {
    applyTaskAssignmentChange,
    type TaskAgentDelivery,
    type TaskWriteResult,
} from './task-assignment.ts';
import { TaskInvariantError } from './task-errors.ts';
import { prepareTaskCreatedEvent } from './task-events.ts';
import { assigneeColumns, requireTaskAssignee, writeTaskLabels } from './task-fields.ts';
import { readTask } from './task-read.ts';
import { readSourceMessage } from './task-source-message.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

/**
 * `task.create`. The number comes from the board's counter under the board row
 * lock, so concurrent creates never collide. `columnId` defaults to the
 * board's first `todo` column. With `sourceMessageId` (Convert to Task) the
 * description defaults to that message's content, and the message is recorded
 * as the Task's first Mentioned in.
 */
export async function createTask(
    db: HausDatabase,
    actor: TaskActor,
    agentDelivery: TaskAgentDelivery,
    input: TaskCreateInput
): Promise<TaskWriteResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireTaskActor(tx, input.serverId, actor);
        const board = await lockBoard(tx, input.serverId, input.boardId);
        if (board.archivedAt !== null) {
            throw new TaskInvariantError('An archived board takes no new tasks.');
        }
        const column = await resolveColumn(tx, input);
        if (input.assignee) {
            await requireTaskAssignee(tx, input.serverId, input.assignee);
        }
        const source = input.sourceMessageId
            ? await readSourceMessage(tx, actor, {
                  messageId: input.sourceMessageId,
                  serverId: input.serverId,
              })
            : null;
        const number = await allocateTaskNumber(tx, input.serverId, board.id);
        const taskId = createOpaqueId('tsk');
        await tx.insert(tasksTable).values({
            ...assigneeColumns(input.assignee ?? null),
            ...creatorColumns(actor),
            boardId: board.id,
            columnId: column.id,
            completedAt: isClosedColumnCategory(column.category) ? sql`now()` : null,
            description:
                input.description ?? source?.content.slice(0, TASK_DESCRIPTION_MAX_CHARS) ?? '',
            dueOn: input.dueOn ?? null,
            id: taskId,
            number,
            priority: input.priority ?? 'none',
            serverId: input.serverId,
            title: input.title,
        });
        await writeTaskLabels(tx, {
            labelIds: input.labelIds ?? [],
            serverId: input.serverId,
            taskId,
        });
        if (source) {
            await recordSourceLink(tx, {
                key: formatTaskKey(board.key, number),
                messageId: source.id,
                serverId: input.serverId,
                taskId,
            });
        }
        const task = await readTask(tx, input.serverId, taskId);
        const assignmentChange = input.assignee
            ? { actor, next: input.assignee, previous: null, task }
            : null;
        const effects = assignmentChange
            ? await applyTaskAssignmentChange(tx, agentDelivery, assignmentChange)
            : { events: [], wakes: [] };
        return {
            assignmentChange,
            events: [prepareTaskCreatedEvent(task), ...effects.events],
            task,
            wakes: effects.wakes,
        };
    });
}

/** Takes the board's next number; the caller holds the board row lock. */
async function allocateTaskNumber(tx: Tx, serverId: string, boardId: string): Promise<number> {
    const [counter] = await tx
        .update(boardsTable)
        .set({ nextNumber: sql`${boardsTable.nextNumber} + 1` })
        .where(and(eq(boardsTable.serverId, serverId), eq(boardsTable.id, boardId)))
        .returning({ nextNumber: boardsTable.nextNumber });
    if (!counter) {
        throw new Error('Failed to allocate the task number.');
    }
    return counter.nextNumber - 1;
}

/** Convert to Task's source never named the Task, so its link text is the key. */
async function recordSourceLink(
    tx: Tx,
    input: { key: string; messageId: string; serverId: string; taskId: string }
) {
    await tx.insert(taskMessageLinksTable).values({
        messageId: input.messageId,
        ordinal: 0,
        serverId: input.serverId,
        taskId: input.taskId,
        text: input.key,
    });
}

async function resolveColumn(
    tx: Tx,
    input: { boardId: string; columnId?: string; serverId: string }
) {
    const [column] = await tx
        .select({ category: boardColumnsTable.category, id: boardColumnsTable.id })
        .from(boardColumnsTable)
        .where(
            and(
                eq(boardColumnsTable.serverId, input.serverId),
                eq(boardColumnsTable.boardId, input.boardId),
                input.columnId === undefined
                    ? eq(boardColumnsTable.category, 'todo')
                    : eq(boardColumnsTable.id, input.columnId)
            )
        )
        .orderBy(asc(boardColumnsTable.position))
        .limit(1);
    if (!column) {
        throw new TaskInvariantError('That column is not on this board.');
    }
    return column;
}
