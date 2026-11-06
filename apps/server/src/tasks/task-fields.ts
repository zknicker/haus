import type { TaskAssignee } from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    serverMembershipsTable,
    taskLabelAssignmentsTable,
    taskLabelsTable,
} from '../postgres/schema.ts';
import { TaskInvariantError } from './task-errors.ts';

type Reader = Pick<HausDatabase, 'select'>;

/** A Task's assignee is an active human member or a non-retired Agent of the Server. */
export async function requireTaskAssignee(
    db: Reader,
    serverId: string,
    assignee: TaskAssignee
): Promise<void> {
    const [found] =
        assignee.kind === 'user'
            ? await db
                  .select({ id: serverMembershipsTable.userId })
                  .from(serverMembershipsTable)
                  .where(
                      and(
                          eq(serverMembershipsTable.serverId, serverId),
                          eq(serverMembershipsTable.userId, assignee.userId),
                          isNull(serverMembershipsTable.revokedAt)
                      )
                  )
                  .limit(1)
            : await db
                  .select({ id: agentsTable.id })
                  .from(agentsTable)
                  .where(
                      and(
                          eq(agentsTable.serverId, serverId),
                          eq(agentsTable.id, assignee.agentId),
                          isNull(agentsTable.retiredAt)
                      )
                  )
                  .limit(1);
    if (!found) {
        throw new TaskInvariantError(
            'A task assignee must be an active member or Agent of this Server.'
        );
    }
}

export function assigneeColumns(assignee: TaskAssignee | null) {
    if (assignee === null) {
        return { assigneeAgentId: null, assigneeUserId: null };
    }
    return assignee.kind === 'user'
        ? { assigneeAgentId: null, assigneeUserId: assignee.userId }
        : { assigneeAgentId: assignee.agentId, assigneeUserId: null };
}

/** Replaces a Task's labels; every label must be in the Server's task label catalog. */
export async function writeTaskLabels(
    tx: Pick<HausDatabase, 'delete' | 'insert' | 'select'>,
    input: { labelIds: readonly string[]; serverId: string; taskId: string }
): Promise<void> {
    const labelIds = [...new Set(input.labelIds)];
    if (labelIds.length > 0) {
        const found = await tx
            .select({ id: taskLabelsTable.id })
            .from(taskLabelsTable)
            .where(
                and(
                    eq(taskLabelsTable.serverId, input.serverId),
                    inArray(taskLabelsTable.id, labelIds)
                )
            );
        if (found.length !== labelIds.length) {
            throw new TaskInvariantError('Every task label must belong to this Server.');
        }
    }
    await tx
        .delete(taskLabelAssignmentsTable)
        .where(
            and(
                eq(taskLabelAssignmentsTable.serverId, input.serverId),
                eq(taskLabelAssignmentsTable.taskId, input.taskId)
            )
        );
    if (labelIds.length > 0) {
        await tx.insert(taskLabelAssignmentsTable).values(
            labelIds.map((labelId) => ({
                labelId,
                serverId: input.serverId,
                taskId: input.taskId,
            }))
        );
    }
}
