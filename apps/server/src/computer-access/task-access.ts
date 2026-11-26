import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, tasksTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export interface TaskSessionGrant {
    archived: boolean;
    captainId: string | null;
    computerId: string;
    serverId: string;
    starterUserId: string | null;
}

export async function readTaskSession(db: Reader, input: { agentId: string; serverId: string }) {
    const [task] = await db
        .select({
            archivedAt: tasksTable.archivedAt,
            captainId: tasksTable.captainId,
            computerId: tasksTable.computerId,
            starterUserId: tasksTable.createdByUserId,
        })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.agentId, input.agentId)))
        .limit(1);
    if (!task?.computerId) {
        return null;
    }
    const grant: TaskSessionGrant = {
        archived: task.archivedAt !== null,
        captainId: task.captainId,
        computerId: task.computerId,
        serverId: input.serverId,
        starterUserId: task.starterUserId,
    };
    return grant;
}

export async function readCrewOn(
    db: Reader,
    input: { captainId: string; computerId: string; serverId: string }
) {
    const rows = await db
        .select({ agentId: tasksTable.agentId })
        .from(tasksTable)
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                eq(tasksTable.captainId, input.captainId),
                eq(tasksTable.computerId, input.computerId),
                isNull(tasksTable.archivedAt)
            )
        );
    return rows.flatMap(({ agentId }) => (agentId ? [agentId] : []));
}

export async function taskMayUse(
    db: Reader,
    task: TaskSessionGrant,
    captainAllowed: (captainId: string) => Promise<boolean>
) {
    if (task.archived) {
        return false;
    }
    if (task.captainId !== null) {
        return await captainAllowed(task.captainId);
    }
    const [computer] = await db
        .select({
            attachedByUserId: computersTable.attachedByUserId,
            scope: computersTable.agentAccessScope,
        })
        .from(computersTable)
        .where(
            and(eq(computersTable.serverId, task.serverId), eq(computersTable.id, task.computerId))
        )
        .limit(1);
    return Boolean(
        computer && (computer.scope === 'all' || computer.attachedByUserId === task.starterUserId)
    );
}
