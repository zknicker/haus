import { and, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { queuedFor, retireQueuedItemsByDedupeKeys } from '../agent-delivery/store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentInboxTable,
    agentsTable,
    boardColumnsTable,
    boardsTable,
    serverMembershipsTable,
} from '../postgres/schema.ts';
import type { TaskAssignmentChange } from './task-assignment.ts';
import { encodeTaskAssignment, taskAssignmentKey } from './task-assignment-envelope.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

/**
 * Hands a Task to an Agent: one chatless `task_assignment` item, keyed by the
 * assignment version. It wakes like a mention, and any assignments still queued
 * coalesce into the same run (specs/inbox.md).
 */
export async function enqueueTaskAssignment(
    tx: Tx,
    agentDelivery: Pick<AgentDelivery, 'enqueue'>,
    input: { agentId: string; change: TaskAssignmentChange }
): Promise<void> {
    const { task } = input.change;
    const dedupeKey = taskAssignmentKey(task.id, task.version);
    const [place] = await tx
        .select({ board: boardsTable.name, column: boardColumnsTable.name })
        .from(boardColumnsTable)
        .innerJoin(
            boardsTable,
            and(
                eq(boardsTable.serverId, boardColumnsTable.serverId),
                eq(boardsTable.id, boardColumnsTable.boardId)
            )
        )
        .where(eq(boardColumnsTable.id, task.columnId))
        .limit(1);
    if (!place) {
        throw new Error(`Task ${task.id} has no column to name in its assignment.`);
    }
    await agentDelivery.enqueue(tx, {
        agentId: input.agentId,
        chatId: null,
        content: encodeTaskAssignment({
            assignedBy: await readAssignerHandle(tx, input.change),
            assignedByAgent: input.change.actor.kind === 'agent',
            board: place.board,
            column: place.column,
            id: dedupeKey,
            key: task.key,
            priority: task.priority,
            taskId: task.id,
            title: task.title,
        }),
        dedupeKey,
        mentioned: true,
        serverId: task.serverId,
        source: 'task_assignment',
    });
}

/**
 * Withdraws an Agent's assignment that has not reached a run yet: the Task was
 * reassigned or unassigned first. An assignment a run already carries stays with
 * that run, which `retireStaleRequeuedItems` covers if it is requeued.
 */
export async function retireTaskAssignments(
    tx: Tx,
    input: { agentId: string; serverId: string; taskId: string }
): Promise<void> {
    const rows = await tx
        .select({ dedupeKey: agentInboxTable.dedupeKey })
        .from(agentInboxTable)
        .where(
            and(
                queuedFor(input.agentId),
                eq(agentInboxTable.source, 'task_assignment'),
                sql`split_part(${agentInboxTable.dedupeKey}, ':', 2) = ${input.taskId}`
            )
        );
    await retireQueuedItemsByDedupeKeys(tx, {
        dedupeKeys: rows.map((row) => row.dedupeKey),
        serverId: input.serverId,
    });
}

/** The assigner's Server handle, or null for a member who has not claimed one. */
async function readAssignerHandle(
    tx: Tx,
    { actor, task }: TaskAssignmentChange
): Promise<string | null> {
    if (actor.kind === 'agent') {
        const [agent] = await tx
            .select({ handle: agentsTable.handle })
            .from(agentsTable)
            .where(and(eq(agentsTable.serverId, task.serverId), eq(agentsTable.id, actor.agentId)))
            .limit(1);
        return agent?.handle ?? null;
    }
    const [member] = await tx
        .select({ handle: serverMembershipsTable.handle })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, task.serverId),
                eq(serverMembershipsTable.userId, actor.userId)
            )
        )
        .limit(1);
    return member?.handle ?? null;
}
