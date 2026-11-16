import type { TaskAssignee } from '@haus/api';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import type { TaskActor } from './task-actor.ts';
import { applyTaskAssignmentChange, type TaskAgentDelivery } from './task-assignment.ts';
import { prepareTaskUpdatedEvent } from './task-events.ts';
import { assigneeColumns } from './task-fields.ts';
import { readTask } from './task-read.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

/**
 * Unassigns every Task held by a departing person or Agent, closed ones too: a Task's assignee is
 * an active member or a non-retired Agent. Each goes through `applyTaskAssignmentChange`, so a
 * departure withdraws Inbox items and queued deliveries exactly as an unassign does. The caller
 * owns the Server lock, so no Task writer can race this selection.
 */
export async function clearTaskAssignments(
    tx: Tx,
    agentDelivery: TaskAgentDelivery,
    input: { actor: TaskActor; assignee: TaskAssignee; serverId: string }
): Promise<PreparedRealtimeEvent[]> {
    const { actor, assignee, serverId } = input;
    const assigned = await tx
        .select({ id: tasksTable.id })
        .from(tasksTable)
        .where(
            and(
                eq(tasksTable.serverId, serverId),
                assignee.kind === 'agent'
                    ? eq(tasksTable.assigneeAgentId, assignee.agentId)
                    : eq(tasksTable.assigneeUserId, assignee.userId)
            )
        )
        .orderBy(asc(tasksTable.id));
    const events: PreparedRealtimeEvent[] = [];

    for (const { id } of assigned) {
        await tx
            .update(tasksTable)
            .set({
                ...assigneeColumns(null),
                updatedAt: sql`now()`,
                version: sql`${tasksTable.version} + 1`,
            })
            .where(and(eq(tasksTable.serverId, serverId), eq(tasksTable.id, id)));
        const task = await readTask(tx, serverId, id);
        const effects = await applyTaskAssignmentChange(tx, agentDelivery, {
            actor,
            next: null,
            previous: assignee,
            task,
        });
        events.push(prepareTaskUpdatedEvent(task), ...effects.events);
    }

    return events;
}
