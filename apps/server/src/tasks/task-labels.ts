import type { TaskLabel } from '@haus/api';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { taskLabelsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { taskLabelUpdatedTopic } from '../realtime/topics.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';

export class TaskLabelConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TaskLabelConflictError';
    }
}

export class TaskLabelAdminRequiredError extends Error {
    constructor() {
        super('Only a Server Owner or Admin may manage the shared task-label catalog.');
        this.name = 'TaskLabelAdminRequiredError';
    }
}

export async function listTaskLabels(
    db: HausDatabase,
    member: HausUser | null,
    serverId: string
): Promise<TaskLabel[]> {
    await requireServerMembership(db, member, serverId);
    return await db
        .select({
            color: taskLabelsTable.color,
            id: taskLabelsTable.id,
            name: taskLabelsTable.name,
        })
        .from(taskLabelsTable)
        .where(eq(taskLabelsTable.serverId, serverId))
        .orderBy(asc(taskLabelsTable.name));
}

export async function createTaskLabel(
    db: HausDatabase,
    member: HausUser | null,
    input: { name: string; serverId: string }
): Promise<{ event: PreparedRealtimeEvent; label: TaskLabel }> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireServerMembership(tx, member, input.serverId);
        const [existing] = await tx
            .select({
                color: taskLabelsTable.color,
                id: taskLabelsTable.id,
                name: taskLabelsTable.name,
            })
            .from(taskLabelsTable)
            .where(
                and(
                    eq(taskLabelsTable.serverId, input.serverId),
                    sql`lower(${taskLabelsTable.name}) = lower(${input.name})`
                )
            )
            .limit(1);
        const [inserted] = existing
            ? []
            : await tx
                  .insert(taskLabelsTable)
                  .values({
                      color: colorForLabel(input.name),
                      id: createOpaqueId('lbl'),
                      name: input.name,
                      serverId: input.serverId,
                  })
                  .onConflictDoNothing()
                  .returning({
                      color: taskLabelsTable.color,
                      id: taskLabelsTable.id,
                      name: taskLabelsTable.name,
                  });
        const [concurrent] =
            existing || inserted
                ? []
                : await tx
                      .select({
                          color: taskLabelsTable.color,
                          id: taskLabelsTable.id,
                          name: taskLabelsTable.name,
                      })
                      .from(taskLabelsTable)
                      .where(
                          and(
                              eq(taskLabelsTable.serverId, input.serverId),
                              sql`lower(${taskLabelsTable.name}) = lower(${input.name})`
                          )
                      )
                      .limit(1);
        const label = existing ?? inserted ?? concurrent;
        if (!label) {
            throw new TaskLabelConflictError('Failed to create the task label.');
        }
        const event = prepareTaskLabelEvent(input.serverId, label.id);
        return { event, label };
    });
}

export async function updateTaskLabel(
    db: HausDatabase,
    member: HausUser | null,
    input: {
        color?: TaskLabel['color'];
        labelId: string;
        name?: string;
        serverId: string;
    }
): Promise<{ event: PreparedRealtimeEvent; label: TaskLabel }> {
    try {
        return await db.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            const server = await requireServerMembership(tx, member, input.serverId);
            if (server.role !== 'owner' && server.role !== 'admin') {
                throw new TaskLabelAdminRequiredError();
            }
            const [label] = await tx
                .update(taskLabelsTable)
                .set({
                    ...(input.color ? { color: input.color } : {}),
                    ...(input.name ? { name: input.name } : {}),
                    updatedAt: sql`now()`,
                })
                .where(
                    and(
                        eq(taskLabelsTable.serverId, input.serverId),
                        eq(taskLabelsTable.id, input.labelId)
                    )
                )
                .returning({
                    color: taskLabelsTable.color,
                    id: taskLabelsTable.id,
                    name: taskLabelsTable.name,
                });
            if (!label) {
                throw new TaskLabelConflictError('No task label exists with that id.');
            }
            const event = prepareTaskLabelEvent(input.serverId, label.id);
            return { event, label };
        });
    } catch (cause) {
        if (violatesConstraint(cause, 'task_labels_server_name_key')) {
            throw new TaskLabelConflictError('A task label with that name already exists.');
        }
        throw cause;
    }
}

export async function deleteTaskLabel(
    db: HausDatabase,
    member: HausUser | null,
    input: { labelId: string; serverId: string }
): Promise<{ event: PreparedRealtimeEvent }> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const server = await requireServerMembership(tx, member, input.serverId);
        if (server.role !== 'owner' && server.role !== 'admin') {
            throw new TaskLabelAdminRequiredError();
        }
        const [deleted] = await tx
            .delete(taskLabelsTable)
            .where(
                and(
                    eq(taskLabelsTable.serverId, input.serverId),
                    eq(taskLabelsTable.id, input.labelId)
                )
            )
            .returning({ id: taskLabelsTable.id });
        if (!deleted) {
            throw new TaskLabelConflictError('No task label exists with that id.');
        }
        return {
            event: prepareTaskLabelEvent(input.serverId, input.labelId),
        };
    });
}

export async function requireTaskLabelIds(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    labelIds: string[]
): Promise<void> {
    const uniqueIds = [...new Set(labelIds)];
    if (uniqueIds.length === 0) {
        return;
    }
    const labels = await db
        .select({ id: taskLabelsTable.id })
        .from(taskLabelsTable)
        .where(and(eq(taskLabelsTable.serverId, serverId), inArray(taskLabelsTable.id, uniqueIds)));
    if (labels.length !== uniqueIds.length) {
        throw new TaskLabelConflictError('Every task label must belong to this Server.');
    }
}

function prepareTaskLabelEvent(serverId: string, labelId: string) {
    return taskLabelUpdatedTopic.prepare({ labelId, serverId });
}

function colorForLabel(name: string): TaskLabel['color'] {
    const colors: TaskLabel['color'][] = [
        'red',
        'orange',
        'amber',
        'green',
        'teal',
        'blue',
        'purple',
        'pink',
        'gray',
    ];
    let hash = 0;
    for (const character of name.toLowerCase()) {
        hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }
    return colors[hash % colors.length] ?? 'gray';
}
